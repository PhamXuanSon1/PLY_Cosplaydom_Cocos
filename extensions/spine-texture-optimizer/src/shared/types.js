'use strict';
/**
 * Shared type definitions (JSDoc) + constants for the Spine Texture Optimizer.
 *
 * The whole tool is plain CommonJS so it runs unmodified in:
 *  - the Cocos Creator editor process (Electron / Node 14)
 *  - a bare `node cli.js` prototype run
 *  - the test harness
 */

/**
 * @typedef {Object} AtlasProp
 * @property {string} key      normalized key, e.g. "xy", "bounds", "size"
 * @property {string[]} values raw values, already trimmed
 * @property {string} indent   original leading whitespace (kept for round-trip)
 * @property {string} sep      original separator between values (", " or ",")
 */

/**
 * @typedef {Object} AtlasRegion
 * @property {string} name
 * @property {AtlasProp[]} props
 */

/**
 * @typedef {Object} AtlasPage
 * @property {string} name      texture file name as written in the atlas
 * @property {AtlasProp[]} props
 * @property {AtlasRegion[]} regions
 */

/**
 * @typedef {Object} AtlasFile
 * @property {AtlasPage[]} pages
 * @property {'legacy'|'modern'|'mixed'|'unknown'} format
 * @property {string} eol
 * @property {boolean} leadingBlankLine
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} ImageData
 * @property {number} width
 * @property {number} height
 * @property {Buffer} data RGBA8, width*height*4
 */

/**
 * @typedef {Object} Issue
 * @property {'error'|'warning'|'info'} level
 * @property {string} code
 * @property {string} message
 */

/** Region/page keys that are scaled by the texture scale factor. */
const SCALED_KEYS = ['xy', 'size', 'orig', 'offset', 'bounds', 'offsets', 'split', 'pad'];

/** Keys that must be copied verbatim. */
const VERBATIM_KEYS = ['rotate', 'index', 'filter', 'repeat', 'pma', 'format', 'scale'];

/** Every key the parser recognises as "a property line", not "a region name". */
const KNOWN_KEYS = SCALED_KEYS.concat(VERBATIM_KEYS);

const RESIZE_FILTERS = ['lanczos3', 'mitchell', 'triangle', 'box', 'nearest'];

const SCALE_PRESETS = [1, 0.75, 0.5, 0.25];

/** Warn when a region gets smaller than this after downscaling. */
const MIN_SAFE_REGION_PX = 4;

module.exports = {
    SCALED_KEYS,
    VERBATIM_KEYS,
    KNOWN_KEYS,
    RESIZE_FILTERS,
    SCALE_PRESETS,
    MIN_SAFE_REGION_PX,
};
