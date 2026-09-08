'use strict';
// -----------------------------------------------------------------------------
//  main.js — editor (Node) process
//
//  Owns everything that touches the file system and the asset database:
//    1. copy the exported textures / meshes into the project,
//    2. apply the sampler settings Unity used,
//    3. write one .mtl per distinct Unity render state,
//    4. hand the parsed JSON to the scene process, which builds the nodes.
//
//  Nothing here (and nothing it creates) ships with the game: the result is a
//  plain ParticleSystem node with plain material assets.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const PKG_NAME = 'unity-particle-importer';

// The particle effects moved into an effects/particles/ sub-folder around 3.5;
// try the known locations, newest layout first, then fall back to the shipped
// uuids (stable across 3.7 – 3.8).
const PARTICLE_EFFECT_CANDIDATES = [
    'db://internal/effects/particles/builtin-particle.effect',
    'db://internal/effects/builtin-particle.effect',
];
const TRAIL_EFFECT_CANDIDATES = [
    'db://internal/effects/particles/builtin-particle-trail.effect',
    'db://internal/effects/builtin-particle-trail.effect',
];
const PARTICLE_EFFECT_UUID = 'd1346436-ac96-4271-b863-1f4fdead95b0';
const TRAIL_EFFECT_UUID = '17debcc3-0a6b-4b8a-b00b-dc58b885581e';

// cc.gfx.BlendFactor
const BF = {
    ZERO: 0, ONE: 1, SRC_ALPHA: 2, DST_ALPHA: 3,
    ONE_MINUS_SRC_ALPHA: 4, ONE_MINUS_DST_ALPHA: 5,
    SRC_COLOR: 6, DST_COLOR: 7,
};
// cc.gfx.BlendOp
const BOP = { ADD: 0, SUB: 1, REV_SUB: 2 };

// builtin-particle technique order (identical in 3.7.x and 3.8.x):
//   0 add   1 alpha-blend   2 add-multiply   3 add-smooth   4 premultiply-blend
// Techniques 0-2 use the "tinted" fragment shader and expose tintColor;
// 3 and 4 do not. Picking the technique whose fragment shader matches Unity's
// intent, then overriding only the blend factors, gets the closest result.
const TECH = { ADD: 0, ALPHA_BLEND: 1, ADD_MULTIPLY: 2, ADD_SMOOTH: 3, PREMULTIPLY: 4 };

// Every Unity particle blend mode, expressed as a technique + GPU state override.
const BLEND_PRESETS = {
    Additive:       { tech: TECH.ADD,          blend: true,  src: BF.SRC_ALPHA, dst: BF.ONE,                 eq: BOP.ADD },
    AdditivePremul: { tech: TECH.ADD,          blend: true,  src: BF.ONE,       dst: BF.ONE,                 eq: BOP.ADD },
    AlphaBlend:     { tech: TECH.ALPHA_BLEND,  blend: true,  src: BF.SRC_ALPHA, dst: BF.ONE_MINUS_SRC_ALPHA, eq: BOP.ADD },
    Premultiplied:  { tech: TECH.ALPHA_BLEND,  blend: true,  src: BF.ONE,       dst: BF.ONE_MINUS_SRC_ALPHA, eq: BOP.ADD },
    Multiply:       { tech: TECH.ADD_MULTIPLY, blend: true,  src: BF.DST_COLOR, dst: BF.ZERO,                eq: BOP.ADD },
    Subtractive:    { tech: TECH.ADD,          blend: true,  src: BF.SRC_ALPHA, dst: BF.ONE,                 eq: BOP.REV_SUB },
    Opaque:         { tech: TECH.ALPHA_BLEND,  blend: false, src: BF.ONE,       dst: BF.ZERO,                eq: BOP.ADD },
};

// builtin-particle's tinted shader computes `2.0 * vertexColor * tintColor * tex`,
// so 0.5 (128/255) is the neutral tint, not white.
const NEUTRAL_TINT = 128;

// =============================================================================
//  asset-db helpers
// =============================================================================

async function db(method, ...args) {
    return Editor.Message.request('asset-db', method, ...args);
}

async function ensureFolder(url) {
    const info = await db('query-asset-info', url).catch(() => null);
    if (info) return info;
    // A null body makes create-asset produce a directory.
    return db('create-asset', url, null, { overwrite: false });
}

/** Creates every missing folder along a db:// path. */
async function ensureFolderPath(url) {
    const parts = url.replace(/^db:\/\//, '').split('/').filter(Boolean);
    let cur = 'db:/';
    for (const p of parts) {
        cur += '/' + p;
        if (cur === 'db://assets' || cur === 'db://internal') continue;
        await ensureFolder(cur);
    }
}

/** Copies an external file into the project and returns its asset info. */
async function importExternal(srcFile, destUrl) {
    if (!fs.existsSync(srcFile)) return null;
    try {
        return await db('import-asset', srcFile, destUrl, { overwrite: true, rename: false });
    } catch (e) {
        // Older editors want the destination *folder* rather than the file url.
        try {
            return await db('import-asset', srcFile, path.posix.dirname(destUrl), { overwrite: true });
        } catch (e2) {
            console.error(`[${PKG_NAME}] failed to import ${srcFile}: ${e2.message}`);
            return null;
        }
    }
}

/** Resolves the cc.Texture2D sub-asset uuid of an imported image. */
async function textureUuidOf(imageUrlOrUuid) {
    const info = await db('query-asset-info', imageUrlOrUuid).catch(() => null);
    if (!info) return null;
    if (info.subAssets) {
        // The image importer names its texture sub-asset "6c48a" ("texture" on some versions).
        const sub = info.subAssets.texture || info.subAssets['6c48a'];
        if (sub && sub.uuid) return sub.uuid;
        const first = Object.values(info.subAssets)[0];
        if (first && first.uuid) return first.uuid;
    }
    return info.uuid ? `${info.uuid}@6c48a` : null;
}

/**
 * Resolves the cc.Mesh sub-asset uuid of an imported model file.
 *
 * An .obj yields a single Mesh sub-asset, while an .fbx yields a whole tree
 * (prefab, materials, animations, one Mesh per node), so the sub-asset map is
 * searched by type and, failing that, the folder is queried for cc.Mesh assets
 * belonging to this file.
 */
async function meshUuidOf(fileUuid, folderUrl) {
    const info = await db('query-asset-info', fileUuid).catch(() => null);
    if (info && info.subAssets) {
        const mesh = Object.values(info.subAssets).find((s) => s && s.type === 'cc.Mesh');
        if (mesh && mesh.uuid) return mesh.uuid;
    }

    // Sub-asset uuids are always "<fileUuid>@<id>", so a folder query can be
    // filtered back down to this particular model.
    const assets = await db('query-assets', { pattern: `${folderUrl}/**`, ccType: 'cc.Mesh' }).catch(() => null);
    if (Array.isArray(assets)) {
        const mine = assets.find((a) => a && a.uuid && a.uuid.startsWith(`${fileUuid}@`));
        if (mine) return mine.uuid;
    }
    return null;
}

/**
 * Waits until the asset database can actually resolve a uuid.
 *
 * Saving an image's meta re-imports it, which briefly invalidates its Texture2D
 * sub-asset. Creating a material that points at the sub-asset during that window
 * produces "asset can't be load: <uuid>@6c48a" when the scene later opens.
 */
async function waitForAsset(uuid, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const info = await db('query-asset-info', uuid).catch(() => null);
        if (info && info.uuid) return true;
        if (Date.now() > deadline) return false;
        await new Promise((r) => setTimeout(r, 100));
    }
}

async function readMeta(uuid) {
    const raw = await db('query-asset-meta', uuid);
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Forces the image's asset type to "texture" and copies Unity's sampler state
 * onto it.
 *
 * The type matters: an image imported as "sprite-frame" (or left at the project
 * default) exposes no cc.Texture2D sub-asset, so the generated material would
 * have nothing to point at. Cocos image types are
 * 'raw' | 'texture' | 'normal map' | 'sprite-frame' | 'texture cube'.
 *
 * Saving a meta re-imports the image, so this returns early when the meta is
 * already exactly what we want - that keeps a re-import (and its window where the
 * sub-asset cannot be loaded) out of the common path.
 */
async function applyTextureSettings(imageUuid, tex) {
    try {
        const meta = await readMeta(imageUuid);
        if (!meta) return false;

        meta.userData = meta.userData || {};

        const subKey = meta.subMetas
            ? (meta.subMetas['6c48a'] ? '6c48a' : Object.keys(meta.subMetas)[0])
            : null;
        const sub = subKey ? meta.subMetas[subKey] : null;
        const ud = sub ? (sub.userData || (sub.userData = {})) : null;

        const wanted = {
            wrapModeS: tex.wrapMode,
            wrapModeT: tex.wrapMode,
            minfilter: tex.filterMode,
            magfilter: tex.filterMode,
            mipfilter: tex.mipmaps ? 'linear' : 'none',
        };

        const typeOk = meta.userData.type === 'texture';
        const samplerOk = ud && Object.keys(wanted).every((k) => ud[k] === wanted[k]);
        if (typeOk && samplerOk) return true;      // nothing to do, no re-import

        meta.userData.type = 'texture';
        if (ud) Object.assign(ud, wanted);

        await db('save-asset-meta', imageUuid, JSON.stringify(meta));

        // Confirm it stuck; a rejected meta save is otherwise silent.
        const after = await readMeta(imageUuid).catch(() => null);
        return !!(after && after.userData && after.userData.type === 'texture');
    } catch (e) {
        console.warn(`[${PKG_NAME}] could not apply sampler settings: ${e.message}`);
        return false;
    }
}

// =============================================================================
//  material generation
// =============================================================================

function safeName(s) {
    return String(s || 'material').replace(/[^\w\-]/g, '_');
}

/** `create-node` answers with a uuid or, for multi-selection, an array of them. */
function firstUuid(res) {
    if (Array.isArray(res)) return res[0] || null;
    return typeof res === 'string' ? res : (res && res.uuid) || null;
}

/**
 * Serialises a cc.Material for builtin-particle / builtin-particle-trail.
 *
 * The technique is chosen so the *fragment shader* matches Unity's intent, then
 * the colour blend factors are overridden so the *GPU state* matches exactly.
 * Alpha blend factors are deliberately left at the technique's defaults: they do
 * not affect the visible colour over an opaque background, and Cocos' choices
 * preserve destination alpha, which matters when rendering onto a transparent
 * canvas (playable ads).
 *
 * @param {boolean} tintOnMaterial  true when the exporter did NOT fold the Unity
 *   shader tint into startColor, so the material has to carry it.
 */
function buildMaterial(desc, effectUuid, textureUuid, tintOnMaterial) {
    const preset = BLEND_PRESETS[desc.blend] || BLEND_PRESETS.AlphaBlend;
    const [tx, ty, ox, oy] = desc.tilingOffset || [1, 1, 0, 0];

    // Scale by 0.5 because the shader multiplies the tint by 2.
    const t = desc.tintColor || [255, 255, 255, 255];
    const tint = tintOnMaterial
        ? t.map((v) => Math.round(v * 0.5))
        : [NEUTRAL_TINT, NEUTRAL_TINT, NEUTRAL_TINT, NEUTRAL_TINT];

    // Property names come from the effect itself — it is mainTiling_Offset, not
    // tilingOffset, and a wrong name is silently ignored by the material.
    const props = {
        mainTiling_Offset: { __type__: 'cc.Vec4', x: tx, y: ty, z: ox, w: oy },
    };
    if (preset.tech <= TECH.ADD_MULTIPLY) {
        props.tintColor = { __type__: 'cc.Color', r: tint[0], g: tint[1], b: tint[2], a: tint[3] };
    }
    if (textureUuid) {
        props.mainTexture = { __uuid__: textureUuid, __expectedType__: 'cc.Texture2D' };
    }

    const state = {
        // Always double-sided. Unity's particle shaders default to Cull Back but it
        // never fires there, because Shuriken billboards always face the camera.
        // Cocos generates its own quads whose winding we do not control, so Back
        // culling can make the whole effect invisible — builtin-particle itself
        // ships with cullMode: none for exactly this reason.
        rasterizerState: { cullMode: 0 },
        depthStencilState: {
            depthTest: desc.depthTest !== false,
            depthWrite: !!desc.depthWrite,
        },
        blendState: {
            targets: [{
                blend: preset.blend,
                blendSrc: preset.src,
                blendDst: preset.dst,
                blendEq: preset.eq,
            }],
        },
    };

    // Every technique has two passes (forward + deferred-forward); the second one
    // reuses pass 0's properties but needs its own state override.
    return JSON.stringify({
        __type__: 'cc.Material',
        _name: desc.name,
        _objFlags: 0,
        _native: '',
        _effectAsset: { __uuid__: effectUuid, __expectedType__: 'cc.EffectAsset' },
        _techIdx: preset.tech,
        _defines: [{}, {}],
        _states: [state, JSON.parse(JSON.stringify(state))],
        _props: [props, {}],
    }, null, 2);
}

/** Resolves a builtin effect through its url, falling back to its shipped uuid. */
async function resolveEffect(candidates, fallbackUuid, label) {
    for (const url of candidates) {
        const uuid = await db('query-uuid', url).catch(() => null);
        if (uuid) return uuid;
    }
    const info = await db('query-asset-info', fallbackUuid).catch(() => null);
    if (info && info.uuid) return info.uuid;
    throw new Error(`Could not resolve ${label} — is this Cocos Creator 3.x?`);
}

// =============================================================================
//  import pipeline
// =============================================================================

/**
 * @param {string} jsonPath  absolute path to a *.uparticle.json
 * @param {string} targetDir db:// folder that will receive the generated assets
 * @param {object} opts      { buildInScene, createPrefab }
 */
async function importOne(jsonPath, targetDir, opts = {}) {
    const log = [];
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    if (data.format !== 'unity-particle-export') {
        throw new Error(`${path.basename(jsonPath)} is not a Unity particle export.`);
    }

    const srcDir = path.dirname(jsonPath);
    const root = `${targetDir.replace(/\/+$/, '')}/${safeName(data.rootName)}`;
    await ensureFolderPath(root);
    await ensureFolderPath(`${root}/textures`);
    await ensureFolderPath(`${root}/materials`);

    // --- 1. textures ---------------------------------------------------------
    const texUuids = {};                     // file name -> cc.Texture2D uuid
    for (const tex of data.textures || []) {
        const src = path.join(srcDir, data.textureFolder, tex.file);
        const dest = `${root}/textures/${tex.file}`;
        const info = await importExternal(src, dest);
        if (!info) { log.push(`! missing texture ${tex.file}`); continue; }

        const imageUuid = Array.isArray(info) ? info[0] && info[0].uuid : info.uuid;
        if (!imageUuid) { log.push(`! could not resolve uuid for ${tex.file}`); continue; }

        if (!(await applyTextureSettings(imageUuid, tex))) {
            log.push(`! ${tex.file} could not be switched to asset type "texture"; set it by hand in the Inspector`);
        }

        // The meta save above re-imports the image; wait for the Texture2D
        // sub-asset to come back before any material can point at it.
        const subUuid = await textureUuidOf(imageUuid);
        if (subUuid && !(await waitForAsset(subUuid))) {
            log.push(`! ${tex.file} did not finish importing; re-run the import if it renders untextured`);
        }
        texUuids[tex.file] = subUuid;
    }
    log.push(`${Object.keys(texUuids).length} texture(s) imported`);

    // --- 2. meshes -----------------------------------------------------------
    const meshUuids = {};
    if (data.meshFolder) {
        await ensureFolderPath(`${root}/meshes`);
        const meshDir = path.join(srcDir, data.meshFolder);
        if (fs.existsSync(meshDir)) {
            for (const file of fs.readdirSync(meshDir)) {
                const info = await importExternal(path.join(meshDir, file), `${root}/meshes/${file}`);
                const uuid = info && (Array.isArray(info) ? info[0] && info[0].uuid : info.uuid);
                if (!uuid) continue;

                // FBX takes noticeably longer to import than .obj, and its geometry
                // only appears as a sub-asset once the import finishes.
                await waitForAsset(uuid, 20000);
                const meshUuid = await meshUuidOf(uuid, `${root}/meshes`);
                if (!meshUuid) {
                    log.push(`! no cc.Mesh found inside ${file}; assign the mesh by hand`);
                    continue;
                }
                meshUuids[file] = meshUuid;
            }
            log.push(`${Object.keys(meshUuids).length} mesh(es) imported`);
        }
    }

    // --- 3. materials --------------------------------------------------------
    const effectUuid = await resolveEffect(PARTICLE_EFFECT_CANDIDATES, PARTICLE_EFFECT_UUID, 'builtin-particle.effect');

    // Which material keys are used as trail materials? Those need the trail effect,
    // whose vertex shader lays out ribbon geometry instead of billboards.
    const trailKeys = new Set();
    for (const sys of data.systems || []) {
        if (sys.renderer && sys.renderer.trailMaterialKey) trailKeys.add(sys.renderer.trailMaterialKey);
    }
    const trailEffectUuid = trailKeys.size
        ? await resolveEffect(TRAIL_EFFECT_CANDIDATES, TRAIL_EFFECT_UUID, 'builtin-particle-trail.effect')
        : null;

    // Only carry the tint on the material when the exporter explicitly says it did
    // NOT fold it into startColor. Exports predating that flag always folded, so an
    // absent field must mean "already folded" — otherwise the tint applies twice.
    const tintOnMaterial = !!data.settings && data.settings.foldMaterialTintIntoColor === false;

    const matUuids = {};                     // material key -> uuid (particle material)
    const trailMatUuids = {};                // material key -> uuid (trail material)
    let matIndex = 0;
    for (const desc of data.materials || []) {
        const texUuid = desc.mainTexture ? texUuids[desc.mainTexture] : null;

        const url = `${root}/materials/${safeName(desc.name)}_${matIndex}.mtl`;
        await db('create-asset', url, buildMaterial(desc, effectUuid, texUuid, tintOnMaterial), { overwrite: true });
        matUuids[desc.key] = await db('query-uuid', url);

        if (trailKeys.has(desc.key)) {
            const trailUrl = `${root}/materials/${safeName(desc.name)}_${matIndex}_trail.mtl`;
            await db('create-asset', trailUrl, buildMaterial(desc, trailEffectUuid, texUuid, tintOnMaterial), { overwrite: true });
            trailMatUuids[desc.key] = await db('query-uuid', trailUrl);
        }

        matIndex++;
        if (desc.mainTexture && !texUuid) log.push(`! material ${desc.name} lost its texture`);
    }
    log.push(`${Object.keys(matUuids).length} material(s) created` +
             (trailKeys.size ? ` (+${Object.keys(trailMatUuids).length} trail)` : ''));

    // --- 4. hand off to the scene process ------------------------------------
    if (opts.buildInScene !== false) {
        // Nodes are created through the editor's own `create-node` message rather
        // than with `new Node()` inside the scene process. Engine-side creation
        // does happen, but the Hierarchy panel is driven by editor events, so
        // those nodes stay invisible until the editor is restarted. Going through
        // the message also puts the creation on the undo stack.
        const rootUuid = firstUuid(await Editor.Message.request('scene', 'create-node', {
            name: safeName(data.rootName),
        }));
        if (!rootUuid) throw new Error('The editor refused to create the effect root node — is a scene open?');

        const nodeUuids = [];
        for (const sys of data.systems || []) {
            nodeUuids.push(firstUuid(await Editor.Message.request('scene', 'create-node', {
                parent: rootUuid,
                name: sys.name,
                components: ['cc.ParticleSystem'],
            })));
        }

        const result = await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG_NAME,
            method: 'applyEffect',
            args: [{ data, rootUuid, nodeUuids, matUuids, trailMatUuids, meshUuids }],
        });
        if (result && result.log) log.push(...result.log);

        // Records an undo step and makes the editor re-read the nodes it now owns.
        await Editor.Message.request('scene', 'snapshot').catch(() => { });

        if (opts.createPrefab) {
            const prefabUrl = `${root}/${safeName(data.rootName)}.prefab`;
            try {
                await Editor.Message.request('scene', 'create-prefab', { uuid: rootUuid, url: prefabUrl });
                log.push(`prefab written to ${prefabUrl}`);
            } catch (e) {
                log.push('Could not auto-create a prefab on this editor version — drag the node from the Hierarchy into Assets instead.');
            }
        }
    }

    for (const c of data.compensations || []) log.push(`~ ${c}`);
    for (const w of data.warnings || []) log.push(`! ${w}`);

    return { name: data.rootName, root, log };
}

// =============================================================================
//  extension entry points
// =============================================================================

module.exports = {
    load() { },
    unload() { },

    methods: {
        openPanel() {
            Editor.Panel.open(PKG_NAME);
        },

        async pickJson() {
            const res = await Editor.Dialog.select({
                title: 'Select a .uparticle.json exported from Unity',
                type: 'file',
                filters: [{ name: 'Unity particle export', extensions: ['json'] }],
            });
            return res && res.filePaths && res.filePaths[0] ? res.filePaths[0] : null;
        },

        /** Called by the panel. Returns a report the panel renders. */
        async importFile(jsonPath, targetDir, opts) {
            try {
                const report = await importOne(jsonPath, targetDir || 'db://assets', opts || {});
                console.log(`[${PKG_NAME}] imported ${report.name} into ${report.root}`);
                return { ok: true, ...report };
            } catch (e) {
                console.error(`[${PKG_NAME}] ${e.stack || e.message}`);
                return { ok: false, error: e.message, log: [] };
            }
        },

        /** Menu entry: pick a folder and import every export it contains. */
        async importFolderDialog() {
            const picked = await Editor.Dialog.select({
                title: 'Select the folder Unity exported into',
                type: 'directory',
            });
            if (!picked || !picked.filePaths || !picked.filePaths[0]) return;

            const dir = picked.filePaths[0];
            const files = [];
            const walk = (d) => {
                for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                    const p = path.join(d, entry.name);
                    if (entry.isDirectory()) walk(p);
                    else if (entry.name.endsWith('.uparticle.json')) files.push(p);
                }
            };
            walk(dir);

            if (files.length === 0) {
                await Editor.Dialog.warn('No .uparticle.json files found in that folder.');
                return;
            }

            let ok = 0;
            for (const f of files) {
                const r = await module.exports.methods.importFile(f, 'db://assets/UnityParticles', { createPrefab: true });
                if (r.ok) ok++;
            }
            await Editor.Dialog.info(`Imported ${ok}/${files.length} effect(s) into db://assets/UnityParticles.`);
        },
    },
};
