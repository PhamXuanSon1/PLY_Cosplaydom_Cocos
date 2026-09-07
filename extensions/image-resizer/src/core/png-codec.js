'use strict';
/**
 * Dependency-free PNG decoder / encoder (zlib comes from Node itself).
 *
 * Why not `sharp`? A Cocos extension that needs a native module rebuilt against
 * the editor's Electron ABI is a support nightmare. `image-resizer.js` will use
 * sharp when it happens to be installed, and falls back to this codec otherwise,
 * which is the normal path.
 *
 * Supported on decode: bit depth 1/2/4/8/16, colour types 0/2/3/4/6, tRNS,
 * non-interlaced. Adam7 is rejected with a clear error (Spine never emits it).
 * Encode: 8-bit RGBA (colour type 6) or RGB (type 2) when the image is opaque.
 */

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

let CRC_TABLE = null;
function crcTable() {
    if (CRC_TABLE) {
        return CRC_TABLE;
    }
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        CRC_TABLE[n] = c;
    }
    return CRC_TABLE;
}

function crc32(buf) {
    const table = crcTable();
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

/**
 * Read only the IHDR of a PNG - used by the analyzer so it never has to decode
 * a 4096x4096 page just to learn its size.
 * @param {Buffer} buf
 * @returns {{width:number, height:number, bitDepth:number, colorType:number, interlace:number}}
 */
function probePng(buf) {
    if (buf.length < 33 || !buf.slice(0, 8).equals(SIGNATURE)) {
        throw new Error('Not a PNG file.');
    }
    if (buf.slice(12, 16).toString('ascii') !== 'IHDR') {
        throw new Error('Malformed PNG: first chunk is not IHDR.');
    }
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        bitDepth: buf[24],
        colorType: buf[25],
        interlace: buf[28],
    };
}

/**
 * @param {Buffer} buf
 * @returns {import('../shared/types').ImageData}
 */
function decodePng(buf) {
    const header = probePng(buf);
    if (header.interlace !== 0) {
        throw new Error('Interlaced (Adam7) PNG is not supported.');
    }
    const channels = CHANNELS[header.colorType];
    if (!channels) {
        throw new Error('Unsupported PNG colour type ' + header.colorType + '.');
    }

    let palette = null;
    let transparency = null;
    const idat = [];
    let offset = 8;
    while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.slice(offset + 4, offset + 8).toString('ascii');
        const dataStart = offset + 8;
        const data = buf.slice(dataStart, dataStart + length);
        if (type === 'PLTE') {
            palette = data;
        } else if (type === 'tRNS') {
            transparency = data;
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset = dataStart + length + 4;
    }
    if (!idat.length) {
        throw new Error('Malformed PNG: no IDAT chunk.');
    }

    const raw = zlib.inflateSync(Buffer.concat(idat));
    const width = header.width;
    const height = header.height;
    const bitsPerPixel = channels * header.bitDepth;
    const bytesPerLine = Math.ceil((width * bitsPerPixel) / 8);
    const filterBpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
    if (raw.length < (bytesPerLine + 1) * height) {
        throw new Error('Malformed PNG: truncated image data.');
    }

    const lines = Buffer.allocUnsafe(bytesPerLine * height);
    let rawPos = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rawPos++];
        const lineStart = y * bytesPerLine;
        const prevStart = lineStart - bytesPerLine;
        for (let i = 0; i < bytesPerLine; i++) {
            const x = raw[rawPos + i];
            const a = i >= filterBpp ? lines[lineStart + i - filterBpp] : 0;
            const b = y > 0 ? lines[prevStart + i] : 0;
            const c = y > 0 && i >= filterBpp ? lines[prevStart + i - filterBpp] : 0;
            let value;
            switch (filter) {
                case 0: value = x; break;
                case 1: value = x + a; break;
                case 2: value = x + b; break;
                case 3: value = x + ((a + b) >> 1); break;
                case 4: value = x + paeth(a, b, c); break;
                default: throw new Error('Malformed PNG: unknown filter type ' + filter + '.');
            }
            lines[lineStart + i] = value & 0xff;
        }
        rawPos += bytesPerLine;
    }

    return toRgba(lines, width, height, bytesPerLine, header, palette, transparency);
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
        return a;
    }
    return pb <= pc ? b : c;
}

function toRgba(lines, width, height, bytesPerLine, header, palette, transparency) {
    const out = Buffer.allocUnsafe(width * height * 4);
    const depth = header.bitDepth;
    const colorType = header.colorType;
    const maxValue = (1 << depth) - 1;
    const sampleAt = (lineStart, index) => {
        if (depth === 8) {
            return lines[lineStart + index];
        }
        if (depth === 16) {
            return lines[lineStart + index * 2]; // take the high byte
        }
        const bitPos = index * depth;
        const byte = lines[lineStart + (bitPos >> 3)];
        const shift = 8 - depth - (bitPos & 7);
        return (byte >> shift) & maxValue;
    };
    const expand = depth === 16 || depth === 8 ? (v) => v : (v) => Math.round((v * 255) / maxValue);

    for (let y = 0; y < height; y++) {
        const lineStart = y * bytesPerLine;
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            if (colorType === 3) {
                const index = sampleAt(lineStart, x);
                const p = index * 3;
                out[o] = palette ? palette[p] : 0;
                out[o + 1] = palette ? palette[p + 1] : 0;
                out[o + 2] = palette ? palette[p + 2] : 0;
                out[o + 3] = transparency && index < transparency.length ? transparency[index] : 255;
            } else if (colorType === 0 || colorType === 4) {
                const channels = colorType === 4 ? 2 : 1;
                const g = expand(sampleAt(lineStart, x * channels));
                out[o] = g;
                out[o + 1] = g;
                out[o + 2] = g;
                if (colorType === 4) {
                    out[o + 3] = expand(sampleAt(lineStart, x * channels + 1));
                } else if (transparency && transparency.length >= 2) {
                    const key = expand(transparency.readUInt16BE(0) & maxValue);
                    out[o + 3] = g === key ? 0 : 255;
                } else {
                    out[o + 3] = 255;
                }
            } else {
                const channels = colorType === 6 ? 4 : 3;
                const r = expand(sampleAt(lineStart, x * channels));
                const g = expand(sampleAt(lineStart, x * channels + 1));
                const b = expand(sampleAt(lineStart, x * channels + 2));
                out[o] = r;
                out[o + 1] = g;
                out[o + 2] = b;
                if (colorType === 6) {
                    out[o + 3] = expand(sampleAt(lineStart, x * channels + 3));
                } else if (transparency && transparency.length >= 6) {
                    const kr = expand(transparency.readUInt16BE(0) & maxValue);
                    const kg = expand(transparency.readUInt16BE(2) & maxValue);
                    const kb = expand(transparency.readUInt16BE(4) & maxValue);
                    out[o + 3] = r === kr && g === kg && b === kb ? 0 : 255;
                } else {
                    out[o + 3] = 255;
                }
            }
        }
    }
    return { width, height, data: out };
}

function chunk(type, data) {
    const out = Buffer.allocUnsafe(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
    return out;
}

/**
 * @param {import('../shared/types').ImageData} image
 * @param {{compressionLevel?:number, forceRgba?:boolean}} [options]
 * @returns {Buffer}
 */
function encodePng(image, options) {
    const opts = options || {};
    const width = image.width;
    const height = image.height;
    const src = image.data;

    let opaque = !opts.forceRgba;
    if (opaque) {
        for (let i = 3; i < src.length; i += 4) {
            if (src[i] !== 255) {
                opaque = false;
                break;
            }
        }
    }
    const channels = opaque ? 3 : 4;
    const colorType = opaque ? 2 : 6;

    const bytesPerLine = width * channels;
    const rawSize = (bytesPerLine + 1) * height;
    const raw = Buffer.allocUnsafe(rawSize);
    const line = Buffer.allocUnsafe(bytesPerLine);
    const prev = Buffer.alloc(bytesPerLine);
    const candidate = Buffer.allocUnsafe(bytesPerLine);
    let outPos = 0;

    for (let y = 0; y < height; y++) {
        // Pack the row.
        if (channels === 4) {
            src.copy(line, 0, y * width * 4, (y + 1) * width * 4);
        } else {
            for (let x = 0; x < width; x++) {
                const s = (y * width + x) * 4;
                const d = x * 3;
                line[d] = src[s];
                line[d + 1] = src[s + 1];
                line[d + 2] = src[s + 2];
            }
        }
        // Adaptive filtering: pick the filter with the smallest sum of absolute
        // signed bytes (the heuristic libpng uses).
        let bestFilter = 0;
        let bestScore = Infinity;
        let bestLine = null;
        for (let filter = 0; filter <= 4; filter++) {
            let score = 0;
            for (let i = 0; i < bytesPerLine; i++) {
                const a = i >= channels ? line[i - channels] : 0;
                const b = prev[i];
                const c = i >= channels ? prev[i - channels] : 0;
                let v;
                switch (filter) {
                    case 0: v = line[i]; break;
                    case 1: v = line[i] - a; break;
                    case 2: v = line[i] - b; break;
                    case 3: v = line[i] - ((a + b) >> 1); break;
                    default: v = line[i] - paeth(a, b, c); break;
                }
                v &= 0xff;
                candidate[i] = v;
                score += v < 128 ? v : 256 - v;
            }
            if (score < bestScore) {
                bestScore = score;
                bestFilter = filter;
                bestLine = Buffer.from(candidate);
            }
        }
        raw[outPos++] = bestFilter;
        bestLine.copy(raw, outPos);
        outPos += bytesPerLine;
        line.copy(prev);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const idat = zlib.deflateSync(raw, { level: opts.compressionLevel === undefined ? 9 : opts.compressionLevel });
    return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decodePng, encodePng, probePng, crc32 };
