'use strict';
/**
 * Pure functions: target-size math and output-path naming.
 * No editor / fs access here so everything is unit-testable.
 */

const path = require('path');

const MODES = ['percent', 'fit', 'width', 'height', 'longest'];

/**
 * Compute the new size for one image while always keeping the aspect ratio.
 *
 * @param {number} width   source width
 * @param {number} height  source height
 * @param {object} opts
 * @param {'percent'|'fit'|'width'|'height'|'longest'} opts.mode
 * @param {number} [opts.percent]     percent mode: 20 => 20 %
 * @param {number} [opts.boxWidth]    fit mode: image must fit inside boxWidth x boxHeight
 * @param {number} [opts.boxHeight]
 * @param {number} [opts.target]      width / height / longest mode: the fixed side in px
 * @param {boolean} [opts.allowUpscale=false]  when false, never make an image bigger
 * @param {number} [opts.multipleOf=1]  round the result to a multiple (e.g. 2 or 4)
 * @returns {{newWidth:number,newHeight:number,scale:number,changed:boolean,reason:string}}
 */
function computeTarget(width, height, opts) {
    const o = opts || {};
    if (!(width > 0) || !(height > 0)) {
        throw new Error('Invalid source size ' + width + 'x' + height);
    }
    let scale;
    switch (o.mode) {
        case 'percent': {
            const p = Number(o.percent);
            if (!(p > 0)) {
                throw new Error('Percent must be > 0 (got ' + o.percent + ').');
            }
            scale = p / 100;
            break;
        }
        case 'fit': {
            const bw = Number(o.boxWidth);
            const bh = Number(o.boxHeight);
            if (!(bw > 0) || !(bh > 0)) {
                throw new Error('Fit box must be > 0 (got ' + o.boxWidth + 'x' + o.boxHeight + ').');
            }
            scale = Math.min(bw / width, bh / height);
            break;
        }
        case 'width': {
            const t = Number(o.target);
            if (!(t > 0)) {
                throw new Error('Target width must be > 0.');
            }
            scale = t / width;
            break;
        }
        case 'height': {
            const t = Number(o.target);
            if (!(t > 0)) {
                throw new Error('Target height must be > 0.');
            }
            scale = t / height;
            break;
        }
        case 'longest': {
            const t = Number(o.target);
            if (!(t > 0)) {
                throw new Error('Target size must be > 0.');
            }
            scale = t / Math.max(width, height);
            break;
        }
        default:
            throw new Error('Unknown mode "' + o.mode + '". Expected one of ' + MODES.join(', '));
    }

    let reason = '';
    if (scale > 1 && !o.allowUpscale) {
        scale = 1;
        reason = 'already smaller than target (upscale disabled)';
    }

    const mult = Math.max(1, Math.round(Number(o.multipleOf) || 1));
    let newWidth = Math.max(mult, roundToMultiple(width * scale, mult));
    let newHeight = Math.max(mult, roundToMultiple(height * scale, mult));

    // In fit mode rounding may poke 1px outside the box; snap it back.
    if (o.mode === 'fit' && mult === 1) {
        newWidth = Math.min(newWidth, Number(o.boxWidth));
        newHeight = Math.min(newHeight, Number(o.boxHeight));
    }

    const changed = newWidth !== width || newHeight !== height;
    if (!changed && !reason) {
        reason = 'no size change';
    }
    return { newWidth, newHeight, scale: newWidth / width, changed, reason };
}

function roundToMultiple(v, mult) {
    if (mult <= 1) {
        return Math.round(v);
    }
    return Math.round(v / mult) * mult;
}

/**
 * Build the output file path.
 * @param {string} inputPath
 * @param {object} o
 * @param {'inplace'|'suffix'|'folder'} o.output
 * @param {string} [o.suffix]   pattern for suffix mode, tokens: {w} {h} {p}
 * @param {string} [o.folder]   fs folder for folder mode
 * @param {string} [o.format]   'keep' | 'png' | 'jpg' | 'webp'
 * @param {{newWidth:number,newHeight:number,scale:number}} dims
 */
function buildOutputPath(inputPath, o, dims) {
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const outExt = pickExtension(ext, o.format);
    switch (o.output) {
        case 'inplace':
            return path.join(dir, base + outExt);
        case 'suffix': {
            const pattern = o.suffix && o.suffix.trim() ? o.suffix.trim() : '_{w}x{h}';
            const suffix = pattern
                .replace(/\{w\}/g, String(dims.newWidth))
                .replace(/\{h\}/g, String(dims.newHeight))
                .replace(/\{p\}/g, String(Math.round(dims.scale * 100)));
            return path.join(dir, base + suffix + outExt);
        }
        case 'folder': {
            if (!o.folder) {
                throw new Error('Output folder is empty.');
            }
            return path.join(o.folder, base + outExt);
        }
        default:
            throw new Error('Unknown output mode "' + o.output + '".');
    }
}

function pickExtension(inputExt, format) {
    const f = String(format || 'keep').toLowerCase();
    if (f === 'png') {
        return '.png';
    }
    if (f === 'jpg' || f === 'jpeg') {
        return '.jpg';
    }
    if (f === 'webp') {
        return '.webp';
    }
    return inputExt;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

function isImageFile(file) {
    return IMAGE_EXTENSIONS.indexOf(path.extname(file).toLowerCase()) !== -1;
}

function formatBytes(n) {
    if (!(n >= 0)) {
        return '-';
    }
    if (n < 1024) {
        return n + ' B';
    }
    if (n < 1024 * 1024) {
        return (n / 1024).toFixed(1) + ' KB';
    }
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

module.exports = { computeTarget, buildOutputPath, pickExtension, isImageFile, formatBytes, IMAGE_EXTENSIONS, MODES };
