'use strict';
/**
 * The generate pipeline.
 *
 *   analyze -> validate -> temp folder -> resize pages -> write atlas ->
 *   copy skeleton(s) -> (backup) -> move temp into place -> report
 *
 * Everything is written into a sibling temp folder first, so a failure halfway
 * through (a corrupt page, a full disk, a cancel) never leaves a half-written
 * Spine folder behind: the temp folder is simply deleted.
 */

const fs = require('fs');
const path = require('path');
const { analyzeSpine } = require('./spine-analyzer');
const { validatePlan } = require('./validator');
const { scaleAtlas } = require('./atlas-scaler');
const { serializeAtlas } = require('./atlas-parser');
const { resizeImageFile } = require('./image-resizer');
const { estimate, formatBytes } = require('./report');

function rmrf(target) {
    if (!fs.existsSync(target)) {
        return;
    }
    // Node 14.14+ has rmSync; keep a fallback for older editors.
    if (fs.rmSync) {
        fs.rmSync(target, { recursive: true, force: true });
    } else {
        fs.rmdirSync(target, { recursive: true });
    }
}

function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/** Move a directory, falling back to copy+delete across volumes. */
function moveDir(from, to) {
    try {
        fs.renameSync(from, to);
        return;
    } catch (e) {
        mkdirp(to);
        for (const name of fs.readdirSync(from)) {
            const src = path.join(from, name);
            const dst = path.join(to, name);
            if (fs.statSync(src).isDirectory()) {
                moveDir(src, dst);
            } else {
                fs.copyFileSync(src, dst);
            }
        }
        rmrf(from);
    }
}

/**
 * @param {Object} plan
 * @param {string} plan.atlasPath        absolute path of the source .atlas
 * @param {string} plan.outputDir        absolute path of the output folder
 * @param {number} plan.scale
 * @param {string} [plan.filter]         lanczos3 | mitchell | triangle | box | nearest
 * @param {'A'|'B'} [plan.mode]
 * @param {boolean} [plan.overwrite]
 * @param {boolean} [plan.backup]
 * @param {boolean} [plan.mipmaps]
 * @param {(p:{percent:number,message:string})=>void} [onProgress]
 * @param {{cancelled:boolean}} [cancelToken]
 */
async function generate(plan, onProgress, cancelToken) {
    const log = [];
    const progress = (percent, message) => {
        log.push(message);
        if (onProgress) {
            onProgress({ percent, message });
        }
    };
    const checkCancel = () => {
        if (cancelToken && cancelToken.cancelled) {
            const err = new Error('Cancelled by user.');
            err.cancelled = true;
            throw err;
        }
    };

    progress(0, 'Analyzing ' + plan.atlasPath);
    const analysis = analyzeSpine(plan.atlasPath);
    const validation = validatePlan(analysis, plan);
    if (!validation.canGenerate) {
        const errors = validation.issues.filter((i) => i.level === 'error');
        const err = new Error('Validation failed:\n - ' + errors.map((e) => e.message).join('\n - '));
        err.issues = validation.issues;
        throw err;
    }

    const scaled = scaleAtlas(analysis.atlas, { scale: plan.scale, pageSizes: validation.pageSizes });
    const blocking = scaled.issues.filter((i) => i.level === 'error');
    if (blocking.length) {
        const err = new Error('Atlas rewrite failed:\n - ' + blocking.map((e) => e.message).join('\n - '));
        err.issues = validation.issues.concat(scaled.issues);
        throw err;
    }

    const tempDir = path.join(path.dirname(plan.outputDir), '.' + path.basename(plan.outputDir) + '.tmp-' + process.pid + '-' + Date.now());
    rmrf(tempDir);
    mkdirp(tempDir);

    const written = [];
    try {
        // --- texture pages -------------------------------------------------
        const pageResults = [];
        for (let i = 0; i < analysis.pages.length; i++) {
            checkCancel();
            const page = analysis.pages[i];
            const target = validation.pageSizes[i];
            // Flatten any sub-path so the output folder is self contained.
            const outName = path.basename(page.relative);
            const outFile = path.join(tempDir, outName);
            progress(
                Math.round((i / analysis.pages.length) * 70),
                'Resizing ' + page.name + '  ' + page.width + 'x' + page.height + ' -> ' + target.newWidth + 'x' + target.newHeight
            );
            const result = await resizeImageFile(page.file, outFile, {
                newWidth: target.newWidth,
                newHeight: target.newHeight,
                filter: plan.filter || 'lanczos3',
                premultipliedAlpha: analysis.pma,
            });
            // The atlas must reference the (possibly flattened) output name.
            scaled.atlas.pages[i].name = outName;
            pageResults.push(Object.assign({ name: outName, source: page.name }, result));
            written.push(outFile);
        }

        // --- atlas ---------------------------------------------------------
        checkCancel();
        const atlasOutName = path.basename(plan.atlasPath);
        const atlasOutFile = path.join(tempDir, atlasOutName);
        fs.writeFileSync(atlasOutFile, serializeAtlas(scaled.atlas), 'utf8');
        written.push(atlasOutFile);
        progress(75, 'Wrote ' + atlasOutName);

        // --- skeletons (copied byte for byte in Mode A) ---------------------
        for (const skeleton of analysis.skeletons) {
            checkCancel();
            const dst = path.join(tempDir, skeleton.name);
            fs.copyFileSync(skeleton.file, dst);
            written.push(dst);
            progress(85, 'Copied ' + skeleton.name + ' (' + skeleton.type + ', unmodified)');
        }

        // --- backup + move into place --------------------------------------
        checkCancel();
        let backupDir = null;
        if (fs.existsSync(plan.outputDir)) {
            if (plan.backup) {
                backupDir = plan.outputDir + '.backup-' + timestamp();
                moveDir(plan.outputDir, backupDir);
                progress(90, 'Existing output backed up to ' + path.basename(backupDir));
            } else {
                rmrf(plan.outputDir);
            }
        }
        mkdirp(path.dirname(plan.outputDir));
        moveDir(tempDir, plan.outputDir);
        progress(95, 'Moved into ' + plan.outputDir);

        const outputFiles = fs.readdirSync(plan.outputDir).map((n) => path.join(plan.outputDir, n));
        const bytesOut = outputFiles.reduce((acc, f) => acc + fs.statSync(f).size, 0);
        const bytesIn =
            analysis.pages.reduce((acc, p) => acc + p.bytes, 0) +
            analysis.skeletons.reduce((acc, s) => acc + s.bytes, 0) +
            fs.statSync(plan.atlasPath).size;

        progress(100, 'Done. ' + formatBytes(bytesIn) + ' -> ' + formatBytes(bytesOut));

        return {
            outputDir: plan.outputDir,
            backupDir,
            pages: pageResults,
            skeletons: analysis.skeletons.map((s) => ({ name: s.name, type: s.type, version: s.version })),
            atlasFile: path.join(plan.outputDir, atlasOutName),
            stats: scaled.stats,
            issues: validation.issues.concat(scaled.issues),
            estimate: estimate(analysis, plan, validation.pageSizes),
            bytesIn,
            bytesOut,
            log,
        };
    } catch (e) {
        rmrf(tempDir);
        e.log = log;
        throw e;
    }
}

/** Analyze + validate + estimate without writing anything. */
function analyzeOnly(plan) {
    const analysis = analyzeSpine(plan.atlasPath);
    const validation = validatePlan(analysis, plan);
    const scaled = scaleAtlas(analysis.atlas, { scale: plan.scale, pageSizes: validation.pageSizes });
    return {
        dir: analysis.dir,
        baseName: analysis.baseName,
        format: analysis.atlas.format,
        pma: analysis.pma,
        pages: analysis.pages.map((p, i) => Object.assign({}, p, validation.pageSizes[i])),
        skeletons: analysis.skeletons.map((s) => ({ name: s.name, type: s.type, version: s.version, bytes: s.bytes })),
        stats: scaled.stats,
        issues: dedupe(validation.issues.concat(scaled.issues)),
        estimate: estimate(analysis, plan, validation.pageSizes),
        canGenerate: validation.canGenerate && !scaled.issues.some((i) => i.level === 'error'),
        previewAtlas: serializeAtlas(scaled.atlas),
    };
}

function dedupe(issues) {
    const seen = new Set();
    const out = [];
    for (const issue of issues) {
        const key = issue.level + '|' + issue.code + '|' + issue.message;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(issue);
    }
    return out;
}

module.exports = { generate, analyzeOnly, rmrf, mkdirp };
