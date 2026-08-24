'use strict';
/**
 * libgdx / Spine `.atlas` parser + serializer.
 *
 * Supports both dialects:
 *   legacy (Spine <= 4.0)          modern (Spine >= 4.1 / libgdx 1.9.11+)
 *   -----------------------------  ---------------------------------------
 *   hero.png                       hero.png
 *   size: 2048,2048                size: 2048, 2048
 *   format: RGBA8888               filter: Linear,Linear
 *   filter: Linear,Linear          pma: true
 *   repeat: none                   hero_head
 *   hero_head                        index: -1
 *     rotate: false                  bounds: 100, 200, 300, 400
 *     xy: 100, 200                   offsets: 10, 10, 320, 420
 *     size: 300, 400                 rotate: 90
 *     orig: 320, 420
 *     offset: 10, 10
 *     index: -1
 *
 * Design notes:
 *  - Nothing is rewritten by regex over "every number in the file". Every line
 *    is classified as page-name / region-name / `key: values` property, and only
 *    known geometric keys are ever touched by the scaler.
 *  - Unknown properties are preserved verbatim, in their original order, with
 *    their original indentation and value separator, so a scale of 100% is a
 *    byte-identical round trip.
 */

const { KNOWN_KEYS } = require('../shared/types');

const KNOWN = new Set(KNOWN_KEYS);

/**
 * Decide whether a raw line is a `key: value` property line.
 * A region name may contain spaces, dashes, slashes and even a colon, so a line
 * is only accepted as a property when the key is a plain identifier AND it is a
 * key we know about (or the line is indented, which libgdx never does for names).
 * @param {string} line
 * @returns {{key:string, values:string[], indent:string, sep:string}|null}
 */
function parseProp(line) {
    const colon = line.indexOf(':');
    if (colon === -1) {
        return null;
    }
    const indentMatch = /^[ \t]*/.exec(line);
    const indent = indentMatch ? indentMatch[0] : '';
    const key = line.slice(indent.length, colon).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return null;
    }
    if (!KNOWN.has(key) && indent.length === 0) {
        // Not a key we know and not indented -> almost certainly a region name
        // that happens to contain a colon.
        return null;
    }
    const rest = line.slice(colon + 1);
    const sep = /,\s/.test(rest) ? ', ' : ',';
    const values = rest.split(',').map((v) => v.trim());
    return { key, values, indent, sep };
}

/**
 * @param {string} text
 * @returns {import('../shared/types').AtlasFile}
 */
function parseAtlas(text) {
    const warnings = [];
    const eol = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    const rawLines = text.split(/\r\n|\n|\r/);
    // A trailing newline produces one empty trailing entry; drop it, re-added on write.
    while (rawLines.length && rawLines[rawLines.length - 1].trim() === '') {
        rawLines.pop();
    }

    const pages = [];
    let page = null;
    let region = null;
    let leadingBlankLine = false;
    let sawLegacyKey = false;
    let sawModernKey = false;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.trim() === '') {
            if (pages.length === 0 && page === null) {
                leadingBlankLine = true;
            }
            // Blank line -> the next non-blank line starts a new page.
            page = null;
            region = null;
            continue;
        }

        const prop = parseProp(line);
        if (prop && page) {
            if (prop.key === 'xy' || prop.key === 'orig' || prop.key === 'offset') {
                sawLegacyKey = true;
            }
            if (prop.key === 'bounds' || prop.key === 'offsets') {
                sawModernKey = true;
            }
            (region ? region.props : page.props).push(prop);
            continue;
        }

        if (!page) {
            page = { name: line.trim(), props: [], regions: [] };
            pages.push(page);
            region = null;
            continue;
        }

        region = { name: line.replace(/\s+$/, ''), props: [] };
        page.regions.push(region);
    }

    let format = 'unknown';
    if (sawLegacyKey && sawModernKey) {
        format = 'mixed';
        warnings.push('Atlas mixes legacy (xy/size/orig/offset) and modern (bounds/offsets) region keys.');
    } else if (sawLegacyKey) {
        format = 'legacy';
    } else if (sawModernKey) {
        format = 'modern';
    }

    for (const p of pages) {
        if (!getProp(p, 'size')) {
            warnings.push('Page "' + p.name + '" has no "size:" line; the real PNG size will be used.');
        }
    }

    return { pages, format, eol, leadingBlankLine, warnings };
}

/**
 * @param {{props: import('../shared/types').AtlasProp[]}} owner
 * @param {string} key
 * @returns {import('../shared/types').AtlasProp|null}
 */
function getProp(owner, key) {
    for (const p of owner.props) {
        if (p.key === key) {
            return p;
        }
    }
    return null;
}

/**
 * Numeric values of a property, or null when absent / not numeric.
 * @param {{props: import('../shared/types').AtlasProp[]}} owner
 * @param {string} key
 * @returns {number[]|null}
 */
function getNumbers(owner, key) {
    const prop = getProp(owner, key);
    if (!prop) {
        return null;
    }
    const nums = prop.values.map((v) => Number(v));
    if (nums.some((n) => !isFinite(n))) {
        return null;
    }
    return nums;
}

/** @param {import('../shared/types').AtlasRegion} region */
function isRotated(region) {
    const prop = getProp(region, 'rotate');
    if (!prop) {
        return false;
    }
    const v = String(prop.values[0]).trim().toLowerCase();
    return v === 'true' || v === '90' || v === '270';
}

/**
 * Geometry of a region, normalized across both dialects.
 * @param {import('../shared/types').AtlasRegion} region
 * @returns {{x:number,y:number,w:number,h:number,origW:number,origH:number,offX:number,offY:number}|null}
 */
function getRegionRect(region) {
    const bounds = getNumbers(region, 'bounds');
    if (bounds && bounds.length >= 4) {
        const offsets = getNumbers(region, 'offsets');
        return {
            x: bounds[0],
            y: bounds[1],
            w: bounds[2],
            h: bounds[3],
            offX: offsets ? offsets[0] : 0,
            offY: offsets ? offsets[1] : 0,
            origW: offsets && offsets.length >= 4 ? offsets[2] : bounds[2],
            origH: offsets && offsets.length >= 4 ? offsets[3] : bounds[3],
        };
    }
    const xy = getNumbers(region, 'xy');
    const size = getNumbers(region, 'size');
    if (!xy || !size) {
        return null;
    }
    const orig = getNumbers(region, 'orig');
    const offset = getNumbers(region, 'offset');
    return {
        x: xy[0],
        y: xy[1],
        w: size[0],
        h: size[1],
        offX: offset ? offset[0] : 0,
        offY: offset ? offset[1] : 0,
        origW: orig ? orig[0] : size[0],
        origH: orig ? orig[1] : size[1],
    };
}

/**
 * Serialize back to `.atlas` text.
 * @param {import('../shared/types').AtlasFile} atlas
 * @returns {string}
 */
function serializeAtlas(atlas) {
    const eol = atlas.eol || '\n';
    const out = [];
    if (atlas.leadingBlankLine) {
        out.push('');
    }
    atlas.pages.forEach((page, index) => {
        if (index > 0) {
            out.push('');
        }
        out.push(page.name);
        for (const p of page.props) {
            out.push(p.indent + p.key + ':' + (p.values.length ? ' ' + p.values.join(p.sep) : ''));
        }
        for (const region of page.regions) {
            out.push(region.name);
            for (const p of region.props) {
                out.push(p.indent + p.key + ':' + (p.values.length ? ' ' + p.values.join(p.sep) : ''));
            }
        }
    });
    return out.join(eol) + eol;
}

/** Deep copy so the scaler never mutates the parsed source. */
function cloneAtlas(atlas) {
    return {
        eol: atlas.eol,
        format: atlas.format,
        leadingBlankLine: atlas.leadingBlankLine,
        warnings: atlas.warnings.slice(),
        pages: atlas.pages.map((page) => ({
            name: page.name,
            props: page.props.map((p) => ({ key: p.key, values: p.values.slice(), indent: p.indent, sep: p.sep })),
            regions: page.regions.map((r) => ({
                name: r.name,
                props: r.props.map((p) => ({ key: p.key, values: p.values.slice(), indent: p.indent, sep: p.sep })),
            })),
        })),
    };
}

module.exports = {
    parseAtlas,
    serializeAtlas,
    cloneAtlas,
    getProp,
    getNumbers,
    getRegionRect,
    isRotated,
    parseProp,
};
