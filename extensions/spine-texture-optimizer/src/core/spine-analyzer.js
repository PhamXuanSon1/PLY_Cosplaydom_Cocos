'use strict';
/**
 * Discovers everything that belongs to one Spine export: the atlas, every
 * texture page it declares, and the skeleton file(s) that go with it.
 */

const fs = require('fs');
const path = require('path');
const { parseAtlas, getProp, getNumbers } = require('./atlas-parser');
const { probeImageFile } = require('./image-resizer');

const SKELETON_EXTS = ['.json', '.skel', '.bin'];

/** Cheap "is this a Spine skeleton json" test that does not parse a 20 MB file. */
function looksLikeSkeletonJson(file) {
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(4096);
        const read = fs.readSync(fd, buf, 0, 4096, 0);
        const head = buf.slice(0, read).toString('utf8');
        return /"skeleton"\s*:/.test(head) || /"bones"\s*:/.test(head) || /"slots"\s*:/.test(head);
    } catch (e) {
        return false;
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
}

/** Best-effort runtime version string, for the compatibility warning. */
function readSkeletonVersion(file) {
    try {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.json') {
            const fd = fs.openSync(file, 'r');
            const buf = Buffer.alloc(2048);
            const read = fs.readSync(fd, buf, 0, 2048, 0);
            fs.closeSync(fd);
            const m = /"spine"\s*:\s*"([^"]+)"/.exec(buf.slice(0, read).toString('utf8'));
            return m ? m[1] : null;
        }
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(64);
        const read = fs.readSync(fd, buf, 0, 64, 0);
        fs.closeSync(fd);
        const ascii = buf.slice(0, read).toString('latin1');
        const m = /(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/.exec(ascii);
        return m ? m[1] : null;
    } catch (e) {
        return null;
    }
}

/**
 * @param {string} atlasPath absolute path to the .atlas file
 * @returns {Object} analysis result
 */
function analyzeSpine(atlasPath) {
    /** @type {import('../shared/types').Issue[]} */
    const issues = [];
    if (!fs.existsSync(atlasPath)) {
        throw new Error('Atlas not found: ' + atlasPath);
    }
    const dir = path.dirname(atlasPath);
    const baseName = path.basename(atlasPath, path.extname(atlasPath));
    const text = fs.readFileSync(atlasPath, 'utf8');
    const atlas = parseAtlas(text);
    atlas.warnings.forEach((w) => issues.push({ level: 'warning', code: 'ATLAS_PARSE', message: w }));

    if (!atlas.pages.length) {
        issues.push({ level: 'error', code: 'NO_PAGE', message: 'No texture page found in the atlas.' });
    }
    if (atlas.format === 'unknown') {
        issues.push({
            level: 'warning',
            code: 'ATLAS_FORMAT_UNKNOWN',
            message: 'Could not tell which atlas dialect this is (no xy/size nor bounds keys found).',
        });
    }

    const pages = atlas.pages.map((page) => {
        const declared = getNumbers(page, 'size');
        const rel = page.name.replace(/\\/g, '/');
        const file = path.resolve(dir, rel);
        const entry = {
            name: page.name,
            file,
            relative: rel,
            exists: fs.existsSync(file),
            outsideFolder: rel.indexOf('..') === 0 || path.isAbsolute(rel),
            declaredWidth: declared ? declared[0] : null,
            declaredHeight: declared ? declared[1] : null,
            width: 0,
            height: 0,
            format: path.extname(rel).slice(1).toLowerCase(),
            bytes: 0,
            regionCount: page.regions.length,
        };
        if (!entry.exists) {
            issues.push({
                level: 'error',
                code: 'PAGE_MISSING',
                message: 'Texture page "' + page.name + '" does not exist next to the atlas.',
            });
            return entry;
        }
        if (entry.outsideFolder) {
            issues.push({
                level: 'warning',
                code: 'PAGE_OUTSIDE',
                message: 'Texture page "' + page.name + '" points outside the atlas folder; it will be flattened into the output folder.',
            });
        }
        entry.bytes = fs.statSync(file).size;
        try {
            const probe = probeImageFile(file);
            entry.width = probe.width;
            entry.height = probe.height;
            entry.format = probe.format;
        } catch (e) {
            issues.push({ level: 'error', code: 'PAGE_UNREADABLE', message: 'Cannot read "' + page.name + '": ' + e.message });
            return entry;
        }
        if (entry.format !== 'png') {
            issues.push({
                level: 'warning',
                code: 'PAGE_NOT_PNG',
                message: 'Page "' + page.name + '" is ' + entry.format.toUpperCase() + '. The built-in resizer only writes PNG; install sharp for other formats.',
            });
        }
        if (declared && (declared[0] !== entry.width || declared[1] !== entry.height)) {
            issues.push({
                level: 'warning',
                code: 'PAGE_SIZE_MISMATCH',
                message:
                    'Page "' + page.name + '" declares ' + declared[0] + 'x' + declared[1] + ' but the file is ' +
                    entry.width + 'x' + entry.height + '. The real file size is used.',
            });
        }
        return entry;
    });

    const pma = atlas.pages.some((page) => {
        const prop = getProp(page, 'pma');
        return !!prop && String(prop.values[0]).toLowerCase() === 'true';
    });

    // Skeletons + sibling atlases in the same folder.
    let siblings = [];
    try {
        siblings = fs.readdirSync(dir);
    } catch (e) {
        siblings = [];
    }
    const skeletons = [];
    for (const name of siblings) {
        const ext = path.extname(name).toLowerCase();
        if (SKELETON_EXTS.indexOf(ext) === -1) {
            continue;
        }
        const file = path.join(dir, name);
        if (!fs.statSync(file).isFile()) {
            continue;
        }
        if (ext === '.json' && !looksLikeSkeletonJson(file)) {
            continue;
        }
        skeletons.push({
            name,
            file,
            type: ext === '.json' ? 'json' : 'binary',
            bytes: fs.statSync(file).size,
            version: readSkeletonVersion(file),
            matchesAtlasName: path.basename(name, ext) === baseName,
        });
    }
    // Prefer the skeleton that shares the atlas' base name.
    skeletons.sort((a, b) => (a.matchesAtlasName === b.matchesAtlasName ? 0 : a.matchesAtlasName ? -1 : 1));

    if (!skeletons.length) {
        issues.push({
            level: 'warning',
            code: 'NO_SKELETON',
            message: 'No .json/.skel skeleton found next to the atlas. Only the atlas + textures will be generated.',
        });
    } else if (skeletons.length > 1) {
        issues.push({
            level: 'warning',
            code: 'MULTI_SKELETON',
            message:
                skeletons.length + ' skeletons share this folder (' + skeletons.map((s) => s.name).join(', ') +
                '). They likely share this atlas - all of them are copied, and the originals keep pointing at the original atlas.',
        });
    }

    const otherAtlases = siblings.filter((n) => n.toLowerCase().endsWith('.atlas') && path.join(dir, n) !== atlasPath);
    if (otherAtlases.length) {
        issues.push({
            level: 'info',
            code: 'OTHER_ATLAS',
            message: 'Other atlases in the same folder: ' + otherAtlases.join(', ') + '.',
        });
    }

    return {
        atlasPath,
        dir,
        baseName,
        atlas,
        pages,
        skeletons,
        pma,
        issues,
    };
}

module.exports = { analyzeSpine, looksLikeSkeletonJson, readSkeletonVersion };
