'use strict';
/**
 * Read image dimensions from the file header without decoding pixels.
 * Supports PNG, JPEG, WebP (VP8 / VP8L / VP8X) and BMP.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} file
 * @returns {{width:number,height:number,format:'png'|'jpeg'|'webp'|'bmp'}}
 */
function probeImageFile(file) {
    const fd = fs.openSync(file, 'r');
    try {
        const head = Buffer.alloc(64);
        const read = fs.readSync(fd, head, 0, 64, 0);
        const buf = head.slice(0, read);

        if (buf.length >= 24 && buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
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
        if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
            return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)), format: 'bmp' };
        }
        if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
            return probeJpeg(fd);
        }
        throw new Error('Unsupported image format: ' + path.basename(file));
    } finally {
        fs.closeSync(fd);
    }
}

/** Walk JPEG markers until the first SOFn segment. */
function probeJpeg(fd) {
    const size = fs.fstatSync(fd).size;
    let pos = 2;
    const two = Buffer.alloc(2);
    const seg = Buffer.alloc(9);
    while (pos < size) {
        fs.readSync(fd, two, 0, 2, pos);
        if (two[0] !== 0xff) {
            pos += 1;
            continue;
        }
        const marker = two[1];
        if (marker === 0xff) {
            pos += 1;
            continue;
        }
        pos += 2;
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            continue; // stand-alone markers without a length
        }
        fs.readSync(fd, two, 0, 2, pos);
        const length = two.readUInt16BE(0);
        const isSof =
            marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
            fs.readSync(fd, seg, 0, 9, pos);
            return { width: seg.readUInt16BE(5), height: seg.readUInt16BE(3), format: 'jpeg' };
        }
        if (marker === 0xda) {
            break; // start of scan, no SOF found before it
        }
        pos += length;
    }
    throw new Error('Malformed JPEG: no SOF marker found.');
}

module.exports = { probeImageFile };
