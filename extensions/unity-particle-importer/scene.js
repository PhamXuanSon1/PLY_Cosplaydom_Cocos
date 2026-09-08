'use strict';
// -----------------------------------------------------------------------------
//  scene.js — runs inside the Cocos scene process, where `cc` is available.
//
//  Rebuilds a Unity effect as ordinary cc.ParticleSystem components. Nothing this
//  file creates is a custom component: the finished node uses only engine classes,
//  so the effect plays in a build with no importer code shipped.
//
//  Every write goes through setIfExists()/applyCurveRange(), which probe the
//  component for the property first. That keeps the importer working across 3.x
//  minor versions, where individual module fields come and go.
// -----------------------------------------------------------------------------

const cc = require('cc');
const { Vec3, Quat, Color, director, ParticleSystem } = cc;

// ---------------------------------------------------------------- class lookup

/** Engine classes are re-exported inconsistently across versions; probe both. */
function ccClass(name) {
    return cc[name] || (cc.js && cc.js.getClassByName ? cc.js.getClassByName(`cc.${name}`) : null);
}

const GradientCls = ccClass('Gradient');
const ColorKeyCls = ccClass('ColorKey');
const AlphaKeyCls = ccClass('AlphaKey');
const BurstCls = ccClass('Burst');
const RIM = cc.RealInterpolationMode || { LINEAR: 0, CONSTANT: 1, CUBIC: 2 };
const TWM = cc.TangentWeightMode || { NONE: 0, LEFT: 1, RIGHT: 2, BOTH: 3 };

const WEIGHT_MODE = {
    none: TWM.NONE, in: TWM.LEFT, out: TWM.RIGHT, both: TWM.BOTH,
};

// ------------------------------------------------------------------- utilities

const log = [];
function note(msg) { log.push(msg); }

/** Assigns only if the target actually has the property on this engine version. */
function setIfExists(target, key, value) {
    if (!target || value === undefined || value === null) return false;
    if (!(key in target)) return false;
    try { target[key] = value; return true; }
    catch (e) { return false; }
}

function toColor(arr, fallback) {
    if (!arr) return fallback || new Color(255, 255, 255, 255);
    return new Color(arr[0], arr[1], arr[2], arr[3]);
}

function multiplyColor(c, tint) {
    if (!tint) return c;
    return new Color(
        Math.round(c.r * tint[0] / 255),
        Math.round(c.g * tint[1] / 255),
        Math.round(c.b * tint[2] / 255),
        Math.round(c.a * tint[3] / 255));
}

// ------------------------------------------------------------------- curves

/** Fills a cc.RealCurve (or a legacy AnimationCurve) from exported keyframes. */
function applyRealCurve(target, src) {
    if (!target || !src || !src.keys || src.keys.length === 0) return;

    if (typeof target.assignSorted === 'function') {
        target.assignSorted(src.keys.map((k) => [k.time, {
            value: k.value,
            leftTangent: k.inTangent,
            leftTangentWeight: k.inWeight,
            rightTangent: k.outTangent,
            rightTangentWeight: k.outWeight,
            // Unity's stepped keys carry an infinite tangent; Cocos spells that CONSTANT.
            interpolationMode: k.stepped ? RIM.CONSTANT : RIM.CUBIC,
            tangentWeightMode: WEIGHT_MODE[k.weighted] !== undefined ? WEIGHT_MODE[k.weighted] : TWM.NONE,
        }]));
        return;
    }

    // Pre-3.5 editors still use geometry.AnimationCurve.
    if (target.keyFrames) {
        target.keyFrames = src.keys.map((k) => ({
            time: k.time, value: k.value, inTangent: k.inTangent, outTangent: k.outTangent,
        }));
    }
}

function curveSlot(range, names) {
    for (const n of names) if (range && range[n]) return range[n];
    return null;
}

/** Copies an exported CurveRange onto a live cc.CurveRange. */
function applyCurveRange(dst, src) {
    if (!dst || !src) return;

    dst.mode = src.mode;
    if (src.multiplier !== undefined && 'multiplier' in dst) dst.multiplier = src.multiplier;

    switch (src.mode) {
        case 0: // Constant
            dst.constant = src.constant || 0;
            break;
        case 3: // TwoConstants
            dst.constantMin = src.constantMin || 0;
            dst.constantMax = src.constantMax || 0;
            break;
        case 1: // Curve
            applyRealCurve(curveSlot(dst, ['curve', 'spline', 'splineMax']), src.curve);
            break;
        case 2: // TwoCurves
            applyRealCurve(curveSlot(dst, ['curveMin', 'splineMin']), src.curveMin);
            applyRealCurve(curveSlot(dst, ['curveMax', 'spline', 'splineMax']), src.curveMax);
            break;
    }
}

/**
 * Returns a copy of an exported curve shifted by a constant. Used to fold Unity's
 * Radial velocity into Start Speed. Only constant modes can absorb an offset
 * exactly, so curve modes are reported instead of silently distorted.
 */
function offsetCurve(src, delta, label) {
    if (!src || Math.abs(delta) < 1e-5) return src;
    const out = JSON.parse(JSON.stringify(src));
    if (out.mode === 0) {
        out.constant = (out.constant || 0) + delta;
    } else if (out.mode === 3) {
        out.constantMin = (out.constantMin || 0) + delta;
        out.constantMax = (out.constantMax || 0) + delta;
    } else {
        note(`! ${label}: radial velocity ${delta.toFixed(2)} could not be folded into a curve-mode Start Speed; add it by hand.`);
    }
    return out;
}

// ---------------------------------------------------------------- gradients

function makeGradient(src, tint) {
    if (!GradientCls) return null;
    const g = new GradientCls();

    const colorKeys = (src.colorKeys || []).map((k) => {
        const key = ColorKeyCls ? new ColorKeyCls() : { color: null, time: 0 };
        key.color = multiplyColor(toColor(k.color), tint);
        key.time = k.time;
        return key;
    });
    const alphaKeys = (src.alphaKeys || []).map((k) => {
        const key = AlphaKeyCls ? new AlphaKeyCls() : { alpha: 255, time: 0 };
        key.alpha = tint ? Math.round(k.alpha * tint[3] / 255) : k.alpha;
        key.time = k.time;
        return key;
    });

    if (typeof g.setKeys === 'function') g.setKeys(colorKeys, alphaKeys);
    else { g.colorKeys = colorKeys; g.alphaKeys = alphaKeys; }

    setIfExists(g, 'mode', src.gradientMode || 0);
    return g;
}

/** Copies an exported GradientRange onto a live cc.GradientRange. */
function applyGradientRange(dst, src, tint) {
    if (!dst || !src) return;
    dst.mode = src.mode;

    if (src.color) dst.color = multiplyColor(toColor(src.color), tint);
    if (src.colorMin) dst.colorMin = multiplyColor(toColor(src.colorMin), tint);
    if (src.colorMax) dst.colorMax = multiplyColor(toColor(src.colorMax), tint);

    if (src.gradient) { const g = makeGradient(src.gradient, tint); if (g) dst.gradient = g; }
    if (src.gradientMin) { const g = makeGradient(src.gradientMin, tint); if (g) dst.gradientMin = g; }
    if (src.gradientMax) { const g = makeGradient(src.gradientMax, tint); if (g) dst.gradientMax = g; }
}

// ------------------------------------------------------------- asset loading

function loadAsset(uuid) {
    return new Promise((resolve) => {
        if (!uuid) { resolve(null); return; }
        cc.assetManager.loadAny({ uuid }, (err, asset) => resolve(err ? null : asset));
    });
}

// =============================================================================
//  module application
// =============================================================================

function moduleOf(ps, ...names) {
    for (const n of names) if (ps[n]) return ps[n];
    return null;
}

function applyMain(ps, sys) {
    const m = sys.main;
    if (!m) return;

    setIfExists(ps, 'duration', m.duration);
    setIfExists(ps, 'loop', m.loop);
    setIfExists(ps, 'prewarm', m.prewarm);
    setIfExists(ps, 'playOnAwake', m.playOnAwake);
    setIfExists(ps, 'simulationSpace', m.simulationSpace);
    setIfExists(ps, 'simulationSpeed', m.simulationSpeed);
    setIfExists(ps, 'scaleSpace', m.scaleSpace);
    setIfExists(ps, 'capacity', m.capacity);

    // A Death sub-emitter waits for its owner's particles to expire.
    let delay = m.startDelay;
    if (m.extraStartDelay) delay = offsetCurve(m.startDelay, m.extraStartDelay, sys.name);
    applyCurveRange(ps.startDelay, delay);

    applyCurveRange(ps.startLifetime, m.startLifetime);

    const radial = (sys.velocityOverLifetime && sys.velocityOverLifetime.radialFoldedIntoStartSpeed) || 0;
    applyCurveRange(ps.startSpeed, offsetCurve(m.startSpeed, radial, sys.name));

    setIfExists(ps, 'startSize3D', m.startSize3D);
    applyCurveRange(ps.startSizeX, m.startSizeX);
    applyCurveRange(ps.startSizeY, m.startSizeY);
    applyCurveRange(ps.startSizeZ, m.startSizeZ);

    setIfExists(ps, 'startRotation3D', m.startRotation3D);
    applyCurveRange(ps.startRotationX, m.startRotationX);
    applyCurveRange(ps.startRotationY, m.startRotationY);
    applyCurveRange(ps.startRotationZ, m.startRotationZ);

    applyCurveRange(ps.gravityModifier, m.gravityModifier);

    // The Unity shader's tint is folded in here so brightness matches.
    const tint = sys.renderer ? sys.renderer.materialTint : null;
    applyGradientRange(ps.startColor, m.startColor, tint);
}

function applyEmission(ps, sys) {
    const e = sys.emission;
    if (!e) return;

    applyCurveRange(ps.rateOverTime, e.rateOverTime);
    applyCurveRange(ps.rateOverDistance, e.rateOverDistance);

    if (!BurstCls || !e.bursts) return;
    ps.bursts = e.bursts.map((b) => {
        const burst = new BurstCls();
        setIfExists(burst, 'time', b.time);
        setIfExists(burst, 'repeatCount', b.repeatCount);
        setIfExists(burst, 'repeatInterval', b.repeatInterval);
        applyCurveRange(burst.count, b.count);
        return burst;
    });
}

function applyShape(ps, sys) {
    const mod = moduleOf(ps, 'shapeModule', '_shapeModule');
    const s = sys.shape;
    if (!mod) return;
    if (!s || !s.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'shapeType', s.shapeType);
    setIfExists(mod, 'emitFrom', s.emitFrom);
    setIfExists(mod, 'position', new Vec3(s.position[0], s.position[1], s.position[2]));
    setIfExists(mod, 'rotation', new Vec3(s.rotation[0], s.rotation[1], s.rotation[2]));
    setIfExists(mod, 'scale', new Vec3(s.scale[0], s.scale[1], s.scale[2]));
    setIfExists(mod, 'radius', s.radius);
    setIfExists(mod, 'radiusThickness', s.radiusThickness);
    setIfExists(mod, 'angle', s.angle);
    setIfExists(mod, 'length', s.length);
    setIfExists(mod, 'boxThickness', new Vec3(s.boxThickness[0], s.boxThickness[1], s.boxThickness[2]));
    setIfExists(mod, 'arc', s.arc);
    setIfExists(mod, 'arcMode', s.arcMode);
    setIfExists(mod, 'arcSpread', s.arcSpread);
    applyCurveRange(mod.arcSpeed, s.arcSpeed);
    setIfExists(mod, 'alignToDirection', s.alignToDirection);
    setIfExists(mod, 'randomDirectionAmount', s.randomDirectionAmount);
    setIfExists(mod, 'sphericalDirectionAmount', s.sphericalDirectionAmount);
    setIfExists(mod, 'randomPositionAmount', s.randomPositionAmount);
}

function applyVelocity(ps, sys) {
    const mod = moduleOf(ps, 'velocityOvertimeModule', '_velocityOvertimeModule');
    const v = sys.velocityOverLifetime;
    if (!mod) return;
    if (!v || !v.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    applyCurveRange(mod.x, v.x);
    applyCurveRange(mod.y, v.y);
    applyCurveRange(mod.z, v.z);
    applyCurveRange(mod.speedModifier, v.speedModifier);
    setIfExists(mod, 'space', v.space);
}

function applyLimitVelocity(ps, sys) {
    const mod = moduleOf(ps, 'limitVelocityOvertimeModule', '_limitVelocityOvertimeModule');
    const l = sys.limitVelocityOverLifetime;
    if (!mod) return;
    if (!l || !l.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'separateAxes', l.separateAxes);
    applyCurveRange(mod.limit, l.limit);
    applyCurveRange(mod.limitX, l.limitX);
    applyCurveRange(mod.limitY, l.limitY);
    applyCurveRange(mod.limitZ, l.limitZ);
    setIfExists(mod, 'dampen', l.dampen);
    setIfExists(mod, 'space', l.space);
    setIfExists(mod, 'multiplyDragByParticleSize', l.multiplyDragByParticleSize);
    setIfExists(mod, 'multiplyDragByParticleVelocity', l.multiplyDragByParticleVelocity);
    if (mod.drag) applyCurveRange(mod.drag, l.drag);
    else if (l.drag && l.drag.constant) note(`! ${sys.name}: this editor's Limit Velocity module has no Drag field; Unity's drag was dropped.`);
}

function applyForce(ps, sys) {
    const mod = moduleOf(ps, 'forceOvertimeModule', '_forceOvertimeModule');
    const f = sys.forceOverLifetime;
    if (!mod) return;
    if (!f || !f.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    applyCurveRange(mod.x, f.x);
    applyCurveRange(mod.y, f.y);
    applyCurveRange(mod.z, f.z);
    setIfExists(mod, 'space', f.space);
}

function applyColorOverLifetime(ps, sys) {
    const mod = moduleOf(ps, 'colorOverLifetimeModule', '_colorOverLifetimeModule');
    const c = sys.colorOverLifetime;
    if (!mod) return;
    if (!c || !c.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    applyGradientRange(mod.color, c.color, null);
}

function applySizeOverLifetime(ps, sys) {
    const mod = moduleOf(ps, 'sizeOvertimeModule', '_sizeOvertimeModule');
    const s = sys.sizeOverLifetime;
    if (!mod) return;
    if (!s || !s.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'separateAxes', s.separateAxes);
    applyCurveRange(mod.size, s.size);
    applyCurveRange(mod.x, s.x);
    applyCurveRange(mod.y, s.y);
    applyCurveRange(mod.z, s.z);
}

function applyRotationOverLifetime(ps, sys) {
    const mod = moduleOf(ps, 'rotationOvertimeModule', '_rotationOvertimeModule');
    const r = sys.rotationOverLifetime;
    if (!mod) return;
    if (!r || !r.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'separateAxes', r.separateAxes);
    applyCurveRange(mod.x, r.x);
    applyCurveRange(mod.y, r.y);
    applyCurveRange(mod.z, r.z);
}

function applyTextureAnimation(ps, sys) {
    const mod = moduleOf(ps, 'textureAnimationModule', '_textureAnimationModule');
    const a = sys.textureAnimation;
    if (!mod) return;
    if (!a || !a.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'mode', a.mode);
    setIfExists(mod, 'numTilesX', a.numTilesX);
    setIfExists(mod, 'numTilesY', a.numTilesY);
    setIfExists(mod, 'animation', a.animation);
    applyCurveRange(mod.frameOverTime, a.frameOverTime);
    applyCurveRange(mod.startFrame, a.startFrame);
    setIfExists(mod, 'cycleCount', a.cycleCount);
    setIfExists(mod, 'randomRow', a.randomRow);
    setIfExists(mod, 'rowIndex', a.rowIndex);
}

function applyNoise(ps, sys) {
    const mod = moduleOf(ps, 'noiseModule', '_noiseModule');
    const n = sys.noise;
    if (!mod) {
        if (n && n.enabled) note(`! ${sys.name}: this editor version has no Noise module; the turbulence was dropped.`);
        return;
    }
    if (!n || !n.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'strengthX', n.strengthX);
    setIfExists(mod, 'strengthY', n.strengthY);
    setIfExists(mod, 'strengthZ', n.strengthZ);
    setIfExists(mod, 'noiseSpeedX', n.noiseSpeedX);
    setIfExists(mod, 'noiseSpeedY', n.noiseSpeedY);
    setIfExists(mod, 'noiseSpeedZ', n.noiseSpeedZ);
    setIfExists(mod, 'noiseFrequency', n.noiseFrequency);
    setIfExists(mod, 'remapEnable', n.remapEnable);
    setIfExists(mod, 'remapX', n.remapX);
    setIfExists(mod, 'remapY', n.remapY);
    setIfExists(mod, 'remapZ', n.remapZ);
    setIfExists(mod, 'octaves', n.octaves);
    setIfExists(mod, 'octaveMultiplier', n.octaveMultiplier);
    setIfExists(mod, 'octaveScale', n.octaveScale);
}

function applyTrail(ps, sys) {
    const mod = moduleOf(ps, 'trailModule', '_trailModule');
    const t = sys.trail;
    if (!mod) return;
    if (!t || !t.enabled) { setIfExists(mod, 'enable', false); return; }

    setIfExists(mod, 'enable', true);
    setIfExists(mod, 'mode', t.mode);
    applyCurveRange(mod.lifeTime, t.lifeTime);
    setIfExists(mod, 'ratio', t.ratio);
    setIfExists(mod, 'minParticleDistance', t.minParticleDistance);
    setIfExists(mod, 'existWithParticles', t.existWithParticles);
    setIfExists(mod, 'space', t.space);
    setIfExists(mod, 'textureMode', t.textureMode);
    setIfExists(mod, 'widthFromParticle', t.widthFromParticle);
    applyCurveRange(mod.widthRatio, t.widthRatio);
    setIfExists(mod, 'colorFromParticle', t.colorFromParticle);
    applyGradientRange(mod.colorOverTrail, t.colorOverTrail, null);
    applyGradientRange(mod.colorOvertime, t.colorOvertime, null);
}

async function applyRenderer(ps, sys, matUuids, trailMatUuids, meshUuids) {
    const r = sys.renderer;
    const rend = moduleOf(ps, 'renderer', '_renderer');
    if (!r || !rend) return;

    // Render mode first: assigning the material re-derives shader defines from it.
    setIfExists(rend, 'renderMode', r.renderMode);
    setIfExists(rend, 'velocityScale', r.velocityScale);
    setIfExists(rend, 'lengthScale', r.lengthScale);
    setIfExists(rend, 'alignSpace', r.alignSpace);

    if (r.mesh && meshUuids[r.mesh]) {
        const mesh = await loadAsset(meshUuids[r.mesh]);
        if (mesh) setIfExists(rend, 'mesh', mesh);
        else note(`! ${sys.name}: mesh ${r.mesh} failed to load.`);
    }

    // The CPU processor is what a Unity effect maps onto, so pin it before the
    // material goes in: _switchProcessor() picks cpuMaterial or gpuMaterial from
    // this flag, and a mismatch clears the slot again.
    setIfExists(rend, 'useGPU', false);

    if (r.materialKey && matUuids[r.materialKey]) {
        const mat = await loadAsset(matUuids[r.materialKey]);
        if (!mat) {
            note(`! ${sys.name}: material failed to load; assign it by hand.`);
        } else {
            // `cpuMaterial` is the serialized slot the inspector shows, and its
            // setter also assigns particleMaterial. Setting particleMaterial on its
            // own leaves the slot empty, and _switchProcessor() then resets the
            // renderer back to that empty slot - so the effect renders untextured.
            let filled = false;
            if ('cpuMaterial' in rend) {
                // The setter silently refuses effects whose name has no "particle"
                // in it, so confirm the assignment actually took.
                rend.cpuMaterial = mat;
                filled = rend.cpuMaterial === mat;
            }
            if (!filled) {
                setIfExists(rend, 'particleMaterial', mat);
                note(`! ${sys.name}: could not fill the CPU Material slot; assigned the material to the renderer directly.`);
            }
        }
    }

    // Trails need builtin-particle-trail, whose vertex shader lays out ribbon
    // geometry; main.js emitted a separate .mtl for it.
    if (r.trailMaterialKey) {
        const uuid = trailMatUuids[r.trailMaterialKey] || matUuids[r.trailMaterialKey];
        const mat = await loadAsset(uuid);
        if (mat) setIfExists(rend, 'trailMaterial', mat);
    }

    if (r.enabled === false) ps.enabled = false;
}

// =============================================================================
//  entry point called from main.js
// =============================================================================

/** Depth-first uuid lookup over the live scene graph. */
function findByUuid(root, uuid) {
    if (!uuid) return null;
    if (root.uuid === uuid) return root;
    for (const child of root.children) {
        const hit = findByUuid(child, uuid);
        if (hit) return hit;
    }
    return null;
}

/**
 * Fills in nodes the editor has already created (see main.js) with the exported
 * particle data. The nodes must come from the editor's `create-node` message:
 * creating them here with `new Node()` leaves the Hierarchy panel unaware of them
 * until the editor restarts.
 */
async function applyEffect(payload) {
    log.length = 0;
    const { data, rootUuid, nodeUuids = [], matUuids = {}, trailMatUuids = {}, meshUuids = {} } = payload;

    const scene = director.getScene();
    if (!scene) return { log: ['No scene is open — open one and import again.'] };

    const root = findByUuid(scene, rootUuid);
    if (!root) return { log: ['The effect root node vanished before it could be filled in.'] };

    const systems = data.systems || [];
    for (let i = 0; i < systems.length; i++) {
        const sys = systems[i];
        const node = findByUuid(scene, nodeUuids[i]);
        if (!node) { note(`! ${sys.name}: node was not created; skipped.`); continue; }

        // Transforms are exported relative to the effect root, so every system can
        // hang directly off it and still land in exactly the right place.
        node.setPosition(new Vec3(sys.position[0], sys.position[1], sys.position[2]));
        node.setRotation(new Quat(sys.rotation[0], sys.rotation[1], sys.rotation[2], sys.rotation[3]));
        node.setScale(new Vec3(sys.scale[0], sys.scale[1], sys.scale[2]));
        node.active = sys.active !== false;

        // create-node was asked for the component, but fall back in case the
        // editor version names it differently.
        const ps = node.getComponent(ParticleSystem) || node.addComponent(ParticleSystem);

        applyMain(ps, sys);
        applyEmission(ps, sys);
        applyShape(ps, sys);
        applyVelocity(ps, sys);
        applyLimitVelocity(ps, sys);
        applyForce(ps, sys);
        applyColorOverLifetime(ps, sys);
        applySizeOverLifetime(ps, sys);
        applyRotationOverLifetime(ps, sys);
        applyTextureAnimation(ps, sys);
        applyNoise(ps, sys);
        applyTrail(ps, sys);
        await applyRenderer(ps, sys, matUuids, trailMatUuids, meshUuids);
    }

    note(`${systems.length} particle system(s) rebuilt under "${root.name}".`);
    note('If the Inspector still shows defaults, click another node and back — the panel caches its dump.');

    return { log: log.slice() };
}

module.exports = {
    load() { },
    unload() { },
    methods: { applyEffect },
};
