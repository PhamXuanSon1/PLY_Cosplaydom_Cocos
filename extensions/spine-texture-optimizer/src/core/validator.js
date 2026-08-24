'use strict';
/**
 * Everything that must be true before a single byte is written.
 * The validator never touches the filesystem beyond `stat`/`readdir`.
 */

const fs = require('fs');
const path = require('path');
const { MIN_SAFE_REGION_PX } = require('../shared/types');

function isPowerOfTwo(n) {
    return n > 0 && (n & (n - 1)) === 0;
}

function samePath(a, b) {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function isInside(parent, child) {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel !== '' && rel.indexOf('..') !== 0 && !path.isAbsolute(rel);
}

/**
 * @param {ReturnType<typeof import('./spine-analyzer').analyzeSpine>} analysis
 * @param {{scale:number, outputDir:string, filter:string, mode:'A'|'B', overwrite?:boolean}} plan
 * @returns {{issues: import('../shared/types').Issue[], canGenerate: boolean, pageSizes: Array}}
 */
function validatePlan(analysis, plan) {
    /** @type {import('../shared/types').Issue[]} */
    const issues = analysis.issues.slice();
    const scale = plan.scale;

    if (!(scale > 0) || scale > 1) {
        issues.push({ level: 'error', code: 'BAD_SCALE', message: 'Scale must be greater than 0 and at most 1 (got ' + scale + ').' });
    }
    if (scale !== 1 && scale !== 0.5 && scale !== 0.25 && scale !== 0.125) {
        issues.push({
            level: 'info',
            code: 'SCALE_NOT_DYADIC',
            message: 'Scale ' + Math.round(scale * 100) + '% is not a power-of-two fraction; expect up to 1px rounding drift on region edges. 50% / 25% round exactly.',
        });
    }

    if (!plan.outputDir) {
        issues.push({ level: 'error', code: 'NO_OUTPUT', message: 'No output folder given.' });
    } else {
        if (samePath(plan.outputDir, analysis.dir)) {
            issues.push({
                level: 'error',
                code: 'OUTPUT_IS_SOURCE',
                message: 'Output folder is the source folder. This tool never overwrites the original Spine export.',
            });
        } else if (isInside(analysis.dir, plan.outputDir)) {
            issues.push({
                level: 'warning',
                code: 'OUTPUT_INSIDE_SOURCE',
                message: 'Output folder lives inside the source folder. Cocos will import both copies; move it outside if you re-run the tool on this folder.',
            });
        }
        if (fs.existsSync(plan.outputDir)) {
            let entries = [];
            try {
                entries = fs.readdirSync(plan.outputDir);
            } catch (e) {
                entries = [];
            }
            const meaningful = entries.filter((n) => !n.endsWith('.meta') && n !== '.DS_Store');
            if (meaningful.length) {
                issues.push({
                    level: plan.overwrite ? 'warning' : 'error',
                    code: 'OUTPUT_NOT_EMPTY',
                    message:
                        'Output folder already contains ' + meaningful.length + ' file(s)' +
                        (plan.overwrite ? '; they will be replaced.' : '. Tick "Overwrite output folder" or pick another folder.'),
                });
            }
        }
    }

    const pageSizes = analysis.pages.map((page) => {
        if (!page.width || !page.height) {
            // Unreadable page: the analyzer already raised the error, do not
            // invent a 1x1 target for it.
            return { name: page.name, width: page.width, height: page.height, newWidth: 0, newHeight: 0 };
        }
        const newWidth = Math.max(1, Math.round(page.width * scale));
        const newHeight = Math.max(1, Math.round(page.height * scale));
        if (page.width && isPowerOfTwo(page.width) && !isPowerOfTwo(newWidth)) {
            issues.push({
                level: 'warning',
                code: 'PAGE_NOT_POT',
                message:
                    'Page "' + page.name + '" was power-of-two (' + page.width + ') and becomes ' + newWidth +
                    '. Some compressed formats / mipmaps require POT sizes.',
            });
        }
        if (newWidth < 8 || newHeight < 8) {
            issues.push({
                level: 'warning',
                code: 'PAGE_TINY',
                message: 'Page "' + page.name + '" becomes ' + newWidth + 'x' + newHeight + ' px. That is almost certainly too small.',
            });
        }
        return { name: page.name, width: page.width, height: page.height, newWidth, newHeight };
    });

    if (analysis.pma) {
        issues.push({
            level: 'info',
            code: 'PMA',
            message: 'Atlas declares premultiplied alpha (pma: true); the resize keeps the pixels premultiplied and the pma flag untouched.',
        });
    }

    if (plan.mode === 'B') {
        issues.push({
            level: 'warning',
            code: 'MODE_B',
            message:
                'Mode B only resizes the texture; it does not rewrite bones/attachments. Apply 1/' + (1 / scale).toFixed(2) +
                ' compensation yourself (SkeletonData scale or node scale) after checking your Spine runtime.',
        });
    }

    const smallRegions = [];
    for (const page of analysis.atlas.pages) {
        for (const region of page.regions) {
            // cheap check, the exact numbers come out of the scaler
            const sizeProp = region.props.filter((p) => p.key === 'size' || p.key === 'bounds')[0];
            if (!sizeProp) {
                continue;
            }
            const nums = sizeProp.values.map(Number);
            const w = sizeProp.key === 'bounds' ? nums[2] : nums[0];
            const h = sizeProp.key === 'bounds' ? nums[3] : nums[1];
            if (Math.round(w * scale) < MIN_SAFE_REGION_PX || Math.round(h * scale) < MIN_SAFE_REGION_PX) {
                smallRegions.push(region.name);
            }
        }
    }
    if (smallRegions.length) {
        issues.push({
            level: 'warning',
            code: 'SMALL_REGIONS',
            message:
                smallRegions.length + ' region(s) drop below ' + MIN_SAFE_REGION_PX + 'px: ' +
                smallRegions.slice(0, 6).join(', ') + (smallRegions.length > 6 ? ', ...' : '') + '.',
        });
    }

    const canGenerate = !issues.some((i) => i.level === 'error');
    return { issues, canGenerate, pageSizes };
}

module.exports = { validatePlan, isPowerOfTwo, samePath, isInside };
