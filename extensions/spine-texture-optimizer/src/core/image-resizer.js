'use strict';
/**
 * Texture page resizing.
 *
 * Uses `sharp` when it is installed next to the extension (fast, SIMD), and
 * otherwise a self-contained separable resampler over the built-in PNG codec.
 * Both paths produce the same pixel layout; only speed differs.
 *
 * Alpha handling: resampling straight (non-premultiplied) RGBA drags the RGB of
 * fully transparent pixels into visible edges - the classic dark halo around a
 * downscaled Spine character. So every resample is done on premultiplied data
 * and un-premultiplied afterwards, unless the atlas declares `pma: true`, in
 * which case the premultiplied result is what we keep.
 */

const fs = require('fs');
const path = require('path');
const { decodePng, encodePng, probePng } = require('./png-codec');

const KERNELS = {
    nearest: { support: 0.5, fn: (x) => (Math.abs(x) <= 0.5 ? 1 : 0) },
    box: { support: 0.5, fn: (x) => (Math.abs(x) <= 0.5 ? 1 : 0) },
    triangle: { support: 1, fn: (x) => (Math.abs(x) < 1 ? 1 - Math.abs(x) : 0) },
    mitchell: {
        support: 2,
        fn: (x) => {
            const B = 1 / 3;
            const C = 1 / 3;
            const ax = Math.abs(x);
            if (ax < 1) {
                return ((12 - 9 * B - 6 * C) * ax * ax * ax + (-18 + 12 * B + 6 * C) * ax * ax + (6 - 2 * B)) / 6;
            }
            if (ax < 2) {
                return (
                    ((-B - 6 * C) * ax * ax * ax +
                        (6 * B + 30 * C) * ax * ax +
                        (-12 * B - 48 * C) * ax +
                        (8 * B + 24 * C)) /
                    6
                );
            }
            return 0;
        },
    },
    lanczos3: {
        support: 3,
        fn: (x) => {
            const ax = Math.abs(x);
            if (ax < 1e-8) {
                return 1;
            }
            if (ax >= 3) {
                return 0;
            }
            const px = Math.PI * ax;
            return (Math.sin(px) / px) * (Math.sin(px / 3) / (px / 3));
        },
    },
};

/** Precompute the source taps for every destination pixel on one axis. */
function buildContributions(srcSize, dstSize, kernel) {
    const scale = dstSize / srcSize;
    const filterScale = scale < 1 ? 1 / scale : 1; // widen the kernel when minifying
    const support = kernel.support * filterScale;
    const list = new Array(dstSize);
    for (let i = 0; i < dstSize; i++) {
        const center = (i + 0.5) / scale - 0.5;
        let start = Math.floor(center - support + 0.5);
        let end = Math.ceil(center + support - 0.5);
        if (start > end) {
            start = end = Math.round(center);
        }
        const indices = [];
        const weights = [];
        let total = 0;
        for (let j = start; j <= end; j++) {
            const w = kernel.fn((j - center) / filterScale);
            if (w === 0) {
                continue;
            }
            const clamped = j < 0 ? 0 : j >= srcSize ? srcSize - 1 : j;
            indices.push(clamped);
            weights.push(w);
            total += w;
        }
        if (!indices.length) {
            const clamped = Math.min(srcSize - 1, Math.max(0, Math.round(center)));
            indices.push(clamped);
            weights.push(1);
            total = 1;
        }
        for (let k = 0; k < weights.length; k++) {
            weights[k] /= total;
        }
        list[i] = { indices, weights };
    }
    return list;
}

/**
 * Pure-JS resample.
 * @param {import('../shared/types').ImageData} image
 * @param {number} newWidth
 * @param {number} newHeight
 * @param {{filter?:string, premultiplyOutput?:boolean}} [options]
 * @returns {import('../shared/types').ImageData}
 */
function resizeImageData(image, newWidth, newHeight, options) {
    const opts = options || {};
    const kernel = KERNELS[opts.filter] || KERNELS.lanczos3;
    const srcW = image.width;
    const srcH = image.height;
    if (srcW === newWidth && srcH === newHeight) {
        return { width: srcW, height: srcH, data: Buffer.from(image.data) };
    }

    // 1. premultiply
    const src = new Float32Array(srcW * srcH * 4);
    for (let i = 0, n = srcW * srcH; i < n; i++) {
        const o = i * 4;
        const a = image.data[o + 3] / 255;
        src[o] = image.data[o] * a;
        src[o + 1] = image.data[o + 1] * a;
        src[o + 2] = image.data[o + 2] * a;
        src[o + 3] = image.data[o + 3];
    }

    // 2. horizontal pass
    const cx = buildContributions(srcW, newWidth, kernel);
    const tmp = new Float32Array(newWidth * srcH * 4);
    for (let y = 0; y < srcH; y++) {
        const rowIn = y * srcW * 4;
        const rowOut = y * newWidth * 4;
        for (let x = 0; x < newWidth; x++) {
            const c = cx[x];
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            for (let k = 0; k < c.indices.length; k++) {
                const w = c.weights[k];
                const o = rowIn + c.indices[k] * 4;
                r += src[o] * w;
                g += src[o + 1] * w;
                b += src[o + 2] * w;
                a += src[o + 3] * w;
            }
            const o = rowOut + x * 4;
            tmp[o] = r;
            tmp[o + 1] = g;
            tmp[o + 2] = b;
            tmp[o + 3] = a;
        }
    }

    // 3. vertical pass
    const cy = buildContributions(srcH, newHeight, kernel);
    const out = Buffer.allocUnsafe(newWidth * newHeight * 4);
    for (let y = 0; y < newHeight; y++) {
        const c = cy[y];
        for (let x = 0; x < newWidth; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            for (let k = 0; k < c.indices.length; k++) {
                const w = c.weights[k];
                const o = (c.indices[k] * newWidth + x) * 4;
                r += tmp[o] * w;
                g += tmp[o + 1] * w;
                b += tmp[o + 2] * w;
                a += tmp[o + 3] * w;
            }
            const o = (y * newWidth + x) * 4;
            const alpha = clamp255(a);
            if (opts.premultiplyOutput) {
                out[o] = clamp255(r);
                out[o + 1] = clamp255(g);
                out[o + 2] = clamp255(b);
            } else if (alpha === 0) {
                out[o] = 0;
                out[o + 1] = 0;
                out[o + 2] = 0;
            } else {
                const inv = 255 / alpha;
                out[o] = clamp255(r * inv);
                out[o + 1] = clamp255(g * inv);
                out[o + 2] = clamp255(b * inv);
            }
            out[o + 3] = alpha;
        }
    }

    return { width: newWidth, height: newHeight, data: out };
}

function clamp255(v) {
    const r = Math.round(v);
    return r < 0 ? 0 : r > 255 ? 255 : r;
}

function trySharp() {
    try {
        // eslint-disable-next-line global-require
        return require('sharp');
    } catch (e) {
        return null;
    }
}

const SHARP_KERNELS = {
    lanczos3: 'lanczos3',
    mitchell: 'mitchell',
    triangle: 'cubic',
    box: 'nearest',
    nearest: 'nearest',
};

/**
 * Resize a texture page on disk.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{newWidth:number, newHeight:number, filter?:string, premultipliedAlpha?:boolean, useSharp?:boolean}} options
 * @returns {Promise<{width:number,height:number,newWidth:number,newHeight:number,bytesIn:number,bytesOut:number,engine:string}>}
 */
async function resizeImageFile(inputPath, outputPath, options) {
    const bytesIn = fs.statSync(inputPath).size;
    const ext = path.extname(inputPath).toLowerCase();
    const sharp = options.useSharp === false ? null : trySharp();

    if (sharp) {
        const meta = await sharp(inputPath).metadata();
        let pipeline = sharp(inputPath).resize(options.newWidth, options.newHeight, {
            kernel: SHARP_KERNELS[options.filter] || 'lanczos3',
            fit: 'fill',
        });
        if (options.premultipliedAlpha) {
            pipeline = pipeline.premultiply();
        }
        const outExt = path.extname(outputPath).toLowerCase();
        pipeline = outExt === '.webp' ? pipeline.webp({ quality: 90 }) : pipeline.png({ compressionLevel: 9 });
        await pipeline.toFile(outputPath);
        return {
            width: meta.width,
            height: meta.height,
            newWidth: options.newWidth,
            newHeight: options.newHeight,
            bytesIn,
            bytesOut: fs.statSync(outputPath).size,
            engine: 'sharp',
        };
    }

    if (ext !== '.png') {
        throw new Error('Built-in resizer only handles PNG pages (got "' + ext + '"). Install sharp for other formats.');
    }
    const buf = fs.readFileSync(inputPath);
    const image = decodePng(buf);
    const resized = resizeImageData(image, options.newWidth, options.newHeight, {
        filter: options.filter,
        premultiplyOutput: !!options.premultipliedAlpha,
    });
    fs.writeFileSync(outputPath, encodePng(resized));
    return {
        width: image.width,
        height: image.height,
        newWidth: resized.width,
        newHeight: resized.height,
        bytesIn,
        bytesOut: fs.statSync(outputPath).size,
        engine: 'builtin',
    };
}

/**
 * Read image dimensions without decoding pixels. PNG + WebP.
 * @param {string} file
 * @returns {{width:number, height:number, format:string}}
 */
function probeImageFile(file) {
    const fd = fs.openSync(file, 'r');
    try {
        const head = Buffer.alloc(64);
        const read = fs.readSync(fd, head, 0, 64, 0);
        const buf = head.slice(0, read);
        if (buf.length >= 24 && buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
            const info = probePng(buf);
            return { width: info.width, height: info.height, format: 'png' };
        }
        if (buf.length >= 30 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
            const type = buf.slice(12, 16).toString('ascii');
            if (type === 'VP8X') {
                return {
                    width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
                    height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
                    format: 'webp',
                };
            }
            if (type === 'VP8 ') {
                return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: 'webp' };
            }
            if (type === 'VP8L') {
                const bits = buf.readUInt32LE(21);
                return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
            }
        }
        throw new Error('Unsupported image format for "' + path.basename(file) + '" (PNG/WebP only).');
    } finally {
        fs.closeSync(fd);
    }
}

module.exports = { resizeImageFile, resizeImageData, probeImageFile, KERNELS, trySharp };
