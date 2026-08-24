'use strict';
/**
 * Scales the geometry inside a parsed atlas.
 *
 * Rounding rule (important):
 *   Rounding x and w independently lets a region drift off the page edge and
 *   makes neighbouring regions overlap by a pixel. Instead both *edges* are
 *   rounded and the width is derived from them:
 *
 *       x2 = round(x * s)
 *       w2 = max(1, round((x + w) * s) - x2)
 *
 *   That keeps regions that touched in the source touching in the output, and
 *   guarantees `x2 + w2 <= round((x + w) * s) <= pageW2` for in-bounds input.
 */

const { getProp, getNumbers, getRegionRect, isRotated, cloneAtlas } = require('./atlas-parser');
const { MIN_SAFE_REGION_PX } = require('../shared/types');

function roundEdge(v, scale) {
    return Math.round(v * scale);
}

/** Scale a [start, length] pair on one axis using edge rounding. */
function scaleSpan(start, length, scale) {
    const s2 = roundEdge(start, scale);
    const l2 = Math.max(1, roundEdge(start + length, scale) - s2);
    return [s2, l2];
}

function setValues(prop, numbers) {
    prop.values = numbers.map((n) => String(n));
}

/**
 * @param {import('../shared/types').AtlasFile} atlas parsed source atlas (not mutated)
 * @param {Object} options
 * @param {number} options.scale
 * @param {Array<{width:number,height:number,newWidth:number,newHeight:number}>} options.pageSizes
 *        real (probed) source size and the resized output size, one entry per page, in atlas page order
 * @returns {{atlas: import('../shared/types').AtlasFile, issues: import('../shared/types').Issue[], stats: Object}}
 */
function scaleAtlas(atlas, options) {
    const scale = options.scale;
    const pageSizes = options.pageSizes || [];
    const out = cloneAtlas(atlas);
    /** @type {import('../shared/types').Issue[]} */
    const issues = [];
    const stats = {
        regionCount: 0,
        rotatedCount: 0,
        trimmedCount: 0,
        clampedCount: 0,
        smallestRegion: null,
        pages: [],
    };

    out.pages.forEach((page, pageIndex) => {
        const info = pageSizes[pageIndex];
        if (!info) {
            issues.push({
                level: 'error',
                code: 'PAGE_SIZE_MISSING',
                message: 'No image size resolved for page "' + page.name + '".',
            });
            return;
        }
        if (!info.width || !info.height) {
            // The page image is missing or unreadable; the analyzer already
            // reported it. Leave its regions untouched instead of drowning the
            // report in bogus out-of-bounds errors against a 1x1 page.
            issues.push({
                level: 'warning',
                code: 'PAGE_SKIPPED',
                message: 'Page "' + page.name + '" has no readable image, so its ' + page.regions.length + ' region(s) were left unscaled.',
            });
            return;
        }
        const pageW2 = info.newWidth;
        const pageH2 = info.newHeight;

        const sizeProp = getProp(page, 'size');
        if (sizeProp) {
            setValues(sizeProp, [pageW2, pageH2]);
        } else {
            page.props.unshift({ key: 'size', values: [String(pageW2), String(pageH2)], indent: '', sep: ',' });
        }

        stats.pages.push({
            name: page.name,
            width: info.width,
            height: info.height,
            newWidth: pageW2,
            newHeight: pageH2,
            regionCount: page.regions.length,
        });

        for (const region of page.regions) {
            stats.regionCount++;
            const rect = getRegionRect(region);
            if (!rect) {
                issues.push({
                    level: 'error',
                    code: 'REGION_UNPARSED',
                    message: 'Region "' + region.name + '" on page "' + page.name + '" has no readable xy/size or bounds.',
                });
                continue;
            }
            const rotated = isRotated(region);
            if (rotated) {
                stats.rotatedCount++;
            }
            if (rect.origW !== rect.w || rect.origH !== rect.h || rect.offX !== 0 || rect.offY !== 0) {
                stats.trimmedCount++;
            }

            const spanX = scaleSpan(rect.x, rect.w, scale);
            const spanY = scaleSpan(rect.y, rect.h, scale);
            let x2 = spanX[0];
            let w2 = spanX[1];
            let y2 = spanY[0];
            let h2 = spanY[1];

            // A rotated region occupies a swapped rect on the page.
            const occW = rotated ? h2 : w2;
            const occH = rotated ? w2 : h2;
            let clamped = false;
            if (x2 + occW > pageW2) {
                const nx = Math.max(0, pageW2 - occW);
                if (nx !== x2) {
                    x2 = nx;
                    clamped = true;
                }
            }
            if (y2 + occH > pageH2) {
                const ny = Math.max(0, pageH2 - occH);
                if (ny !== y2) {
                    y2 = ny;
                    clamped = true;
                }
            }
            if (x2 + occW > pageW2 || y2 + occH > pageH2) {
                issues.push({
                    level: 'error',
                    code: 'REGION_OUT_OF_BOUNDS',
                    message:
                        'Region "' + region.name + '" does not fit page "' + page.name + '" after scaling (' +
                        x2 + ',' + y2 + ' ' + occW + 'x' + occH + ' vs page ' + pageW2 + 'x' + pageH2 + ').',
                });
            }
            if (clamped) {
                stats.clampedCount++;
                issues.push({
                    level: 'warning',
                    code: 'REGION_CLAMPED',
                    message: 'Region "' + region.name + '" was nudged back inside page "' + page.name + '" by 1px after rounding.',
                });
            }

            // Trim data: keep offX + w <= origW consistent after rounding.
            let offX2 = roundEdge(rect.offX, scale);
            let offY2 = roundEdge(rect.offY, scale);
            let origW2 = Math.max(1, roundEdge(rect.origW, scale));
            let origH2 = Math.max(1, roundEdge(rect.origH, scale));
            origW2 = Math.max(origW2, offX2 + w2);
            origH2 = Math.max(origH2, offY2 + h2);

            writeRegion(region, { x: x2, y: y2, w: w2, h: h2, offX: offX2, offY: offY2, origW: origW2, origH: origH2 });
            scaleQuad(region, 'split', scale);
            scaleQuad(region, 'pad', scale);

            const smallest = Math.min(w2, h2);
            if (!stats.smallestRegion || smallest < stats.smallestRegion.size) {
                stats.smallestRegion = { name: region.name, size: smallest, width: w2, height: h2 };
            }
            if (smallest < MIN_SAFE_REGION_PX) {
                issues.push({
                    level: 'warning',
                    code: 'REGION_TINY',
                    message:
                        'Region "' + region.name + '" becomes ' + w2 + 'x' + h2 + ' px (was ' + rect.w + 'x' + rect.h +
                        '). Below ' + MIN_SAFE_REGION_PX + 'px details and edges are usually lost.',
                });
            }
        }
    });

    return { atlas: out, issues, stats };
}

/** Write the scaled geometry back using whichever dialect the region uses. */
function writeRegion(region, r) {
    const bounds = getProp(region, 'bounds');
    if (bounds) {
        setValues(bounds, [r.x, r.y, r.w, r.h]);
        const offsets = getProp(region, 'offsets');
        if (offsets) {
            setValues(offsets, [r.offX, r.offY, r.origW, r.origH]);
        }
        return;
    }
    const xy = getProp(region, 'xy');
    const size = getProp(region, 'size');
    if (xy) {
        setValues(xy, [r.x, r.y]);
    }
    if (size) {
        setValues(size, [r.w, r.h]);
    }
    const orig = getProp(region, 'orig');
    if (orig) {
        setValues(orig, [r.origW, r.origH]);
    }
    const offset = getProp(region, 'offset');
    if (offset) {
        setValues(offset, [r.offX, r.offY]);
    }
}

/** 9-patch style 4-value properties (split / pad) scale straight through. */
function scaleQuad(region, key, scale) {
    const prop = getProp(region, key);
    if (!prop) {
        return;
    }
    const nums = getNumbers(region, key);
    if (!nums) {
        return;
    }
    setValues(prop, nums.map((n) => Math.max(0, Math.round(n * scale))));
}

module.exports = { scaleAtlas, scaleSpan };
