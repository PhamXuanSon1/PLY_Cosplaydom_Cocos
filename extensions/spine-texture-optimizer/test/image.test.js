'use strict';
const { test, assert } = require('./harness');
const { encodePng, decodePng, probePng } = require('../src/core/png-codec');
const { resizeImageData } = require('../src/core/image-resizer');

function makeImage(width, height, fn) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const px = fn(x, y);
            const o = (y * width + x) * 4;
            data[o] = px[0];
            data[o + 1] = px[1];
            data[o + 2] = px[2];
            data[o + 3] = px[3];
        }
    }
    return { width, height, data };
}

test('png: RGBA round trip is lossless', () => {
    const img = makeImage(37, 19, (x, y) => [(x * 7) & 255, (y * 13) & 255, (x ^ y) & 255, (x * y) & 255]);
    const decoded = decodePng(encodePng(img));
    assert.strictEqual(decoded.width, 37);
    assert.strictEqual(decoded.height, 19);
    assert.ok(decoded.data.equals(img.data), 'pixels identical after encode+decode');
});

test('png: fully opaque images are stored without an alpha channel', () => {
    const img = makeImage(16, 16, (x, y) => [x * 8, y * 8, 0, 255]);
    const buf = encodePng(img);
    assert.strictEqual(probePng(buf).colorType, 2, 'colour type 2 (RGB)');
    const decoded = decodePng(buf);
    assert.ok(decoded.data.equals(img.data), 'still decodes back to opaque RGBA');
});

test('png: probe reads the header without decoding', () => {
    const buf = encodePng(makeImage(64, 32, () => [1, 2, 3, 4]));
    const info = probePng(buf);
    assert.strictEqual(info.width, 64);
    assert.strictEqual(info.height, 32);
    assert.strictEqual(info.interlace, 0);
});

test('resize: flat colour stays exactly that colour at every filter', () => {
    const img = makeImage(64, 64, () => [200, 100, 50, 255]);
    ['lanczos3', 'mitchell', 'triangle', 'box', 'nearest'].forEach((filter) => {
        const out = resizeImageData(img, 32, 32, { filter });
        assert.strictEqual(out.width, 32);
        assert.strictEqual(out.height, 32);
        for (let i = 0; i < out.data.length; i += 4) {
            assert.ok(Math.abs(out.data[i] - 200) <= 1, filter + ' keeps red');
            assert.ok(Math.abs(out.data[i + 1] - 100) <= 1, filter + ' keeps green');
            assert.strictEqual(out.data[i + 3], 255, filter + ' keeps alpha');
        }
    });
});

test('resize: transparent pixels do not bleed dark edges into the sprite', () => {
    // White opaque blob on a *black* fully transparent background: resizing with
    // straight alpha would drag the black in and produce a dark halo.
    const img = makeImage(64, 64, (x, y) => {
        const inside = x >= 16 && x < 48 && y >= 16 && y < 48;
        return inside ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });
    const out = resizeImageData(img, 32, 32, { filter: 'lanczos3' });
    // Sample the pixels straddling the edge of the blob (blob is now 8..24).
    for (let y = 8; y < 24; y++) {
        const o = (y * 32 + 8) * 4;
        if (out.data[o + 3] > 8) {
            assert.ok(out.data[o] > 200, 'edge pixel stays white, got ' + out.data[o]);
        }
    }
});

test('resize: alpha coverage is preserved within a percent', () => {
    const img = makeImage(64, 64, (x, y) => (x < 32 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const out = resizeImageData(img, 32, 32, { filter: 'triangle' });
    let sum = 0;
    for (let i = 3; i < out.data.length; i += 4) {
        sum += out.data[i];
    }
    const coverage = sum / (32 * 32 * 255);
    assert.ok(Math.abs(coverage - 0.5) < 0.02, 'coverage ~50%, got ' + coverage.toFixed(3));
});

test('resize: 1x1 targets never produce a zero-sized image', () => {
    const img = makeImage(9, 9, () => [10, 20, 30, 255]);
    const out = resizeImageData(img, 1, 1, { filter: 'lanczos3' });
    assert.strictEqual(out.data.length, 4);
});
