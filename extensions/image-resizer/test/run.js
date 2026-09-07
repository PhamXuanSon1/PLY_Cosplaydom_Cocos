'use strict';
/**
 * Minimal self-check, no test framework needed:
 *   node extensions/image-resizer/test/run.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeTarget, buildOutputPath } = require('../src/core/plan');
const { encodePng, decodePng } = require('../src/core/png-codec');
const { probeImageFile } = require('../src/core/probe');
const { resizeFile } = require('../src/core/resize-file');
const { rmrf } = require('../src/core/fsx');

let passed = 0;
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            passed += 1;
            console.log('  ok   ' + name);
        })
        .catch((e) => {
            console.error('  FAIL ' + name + '\n       ' + e.message);
            process.exitCode = 1;
        });
}

function dims(r) {
    return r.newWidth + 'x' + r.newHeight;
}

(async () => {
    console.log('computeTarget');
    await test('percent 30% of 2048x2048 -> 614x614', () => {
        assert.strictEqual(dims(computeTarget(2048, 2048, { mode: 'percent', percent: 30 })), '614x614');
    });
    await test('percent keeps ratio on 2048x1024', () => {
        assert.strictEqual(dims(computeTarget(2048, 1024, { mode: 'percent', percent: 25 })), '512x256');
    });
    await test('fit 2048x2048 in 600x600 -> 600x600', () => {
        assert.strictEqual(dims(computeTarget(2048, 2048, { mode: 'fit', boxWidth: 600, boxHeight: 600 })), '600x600');
    });
    await test('fit 2048x1024 in 600x600 -> 600x300 (no distortion)', () => {
        assert.strictEqual(dims(computeTarget(2048, 1024, { mode: 'fit', boxWidth: 600, boxHeight: 600 })), '600x300');
    });
    await test('fit 1000x3000 in 600x600 -> 200x600', () => {
        assert.strictEqual(dims(computeTarget(1000, 3000, { mode: 'fit', boxWidth: 600, boxHeight: 600 })), '200x600');
    });
    await test('fit never exceeds the box after rounding', () => {
        const r = computeTarget(1023, 2047, { mode: 'fit', boxWidth: 600, boxHeight: 600 });
        assert.ok(r.newWidth <= 600 && r.newHeight <= 600, dims(r));
    });
    await test('fit does not upscale by default', () => {
        const r = computeTarget(300, 200, { mode: 'fit', boxWidth: 600, boxHeight: 600 });
        assert.strictEqual(dims(r), '300x200');
        assert.strictEqual(r.changed, false);
    });
    await test('fit upscales when allowed', () => {
        assert.strictEqual(dims(computeTarget(300, 200, { mode: 'fit', boxWidth: 600, boxHeight: 600, allowUpscale: true })), '600x400');
    });
    await test('width 600 on 2048x1536 -> 600x450', () => {
        assert.strictEqual(dims(computeTarget(2048, 1536, { mode: 'width', target: 600 })), '600x450');
    });
    await test('height 600 on 2048x1536 -> 800x600', () => {
        assert.strictEqual(dims(computeTarget(2048, 1536, { mode: 'height', target: 600 })), '800x600');
    });
    await test('longest 600 on 1536x2048 -> 450x600', () => {
        assert.strictEqual(dims(computeTarget(1536, 2048, { mode: 'longest', target: 600 })), '450x600');
    });
    await test('multipleOf 4', () => {
        const r = computeTarget(2048, 1366, { mode: 'percent', percent: 30, multipleOf: 4 });
        assert.strictEqual(r.newWidth % 4, 0);
        assert.strictEqual(r.newHeight % 4, 0);
    });
    await test('rejects bad percent', () => {
        assert.throws(() => computeTarget(100, 100, { mode: 'percent', percent: 0 }));
    });

    console.log('buildOutputPath');
    await test('inplace keeps path', () => {
        const p = buildOutputPath(path.join('a', 'b.png'), { output: 'inplace', format: 'keep' }, { newWidth: 1, newHeight: 1, scale: 1 });
        assert.strictEqual(p, path.join('a', 'b.png'));
    });
    await test('suffix tokens', () => {
        const p = buildOutputPath(path.join('a', 'b.png'), { output: 'suffix', suffix: '_{w}x{h}_{p}p' }, { newWidth: 600, newHeight: 300, scale: 0.3 });
        assert.strictEqual(p, path.join('a', 'b_600x300_30p.png'));
    });
    await test('folder + format jpg', () => {
        const p = buildOutputPath(path.join('a', 'b.png'), { output: 'folder', folder: 'out', format: 'jpg' }, { newWidth: 1, newHeight: 1, scale: 1 });
        assert.strictEqual(p, path.join('out', 'b.jpg'));
    });

    console.log('resize PNG end-to-end');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-resizer-'));
    const src = path.join(tmp, 'src.png');
    await test('encode 256x128 test image with transparent border', () => {
        const w = 256;
        const h = 128;
        const data = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const o = (y * w + x) * 4;
                const inside = x > 16 && x < w - 16 && y > 16 && y < h - 16;
                data[o] = 220;
                data[o + 1] = 40;
                data[o + 2] = 40;
                data[o + 3] = inside ? 255 : 0;
            }
        }
        fs.writeFileSync(src, encodePng({ width: w, height: h, data }));
        const info = probeImageFile(src);
        assert.strictEqual(info.width + 'x' + info.height, '256x128');
    });
    await test('resize to 25% -> 64x32, alpha edge has no dark halo', async () => {
        const out = path.join(tmp, 'out.png');
        const r = await resizeFile(src, out, { newWidth: 64, newHeight: 32, filter: 'lanczos3' });
        assert.strictEqual(r.engine, 'builtin');
        const img = decodePng(fs.readFileSync(out));
        assert.strictEqual(img.width + 'x' + img.height, '64x32');
        // centre pixel stays red & opaque
        const c = (16 * 64 + 32) * 4;
        assert.ok(img.data[c] > 200 && img.data[c + 3] === 255, 'centre ' + Array.from(img.data.slice(c, c + 4)));
        // every partially transparent pixel keeps the red hue (premultiplied resample)
        for (let i = 0; i < 64 * 32; i++) {
            const o = i * 4;
            if (img.data[o + 3] >= 8 && img.data[o + 3] < 255) {
                assert.ok(img.data[o] > 150, 'halo at pixel ' + i + ': ' + Array.from(img.data.slice(o, o + 4)));
            }
        }
    });
    await test('in-place overwrite via temp file', async () => {
        const copy = path.join(tmp, 'inplace.png');
        fs.copyFileSync(src, copy);
        await resizeFile(copy, copy, { newWidth: 128, newHeight: 64 });
        const info = probeImageFile(copy);
        assert.strictEqual(info.width + 'x' + info.height, '128x64');
        assert.strictEqual(fs.readdirSync(tmp).filter((f) => f.indexOf('resize-tmp') !== -1).length, 0, 'temp file left behind');
    });

    rmrf(tmp);
    console.log(process.exitCode ? 'FAILED' : 'all ' + passed + ' tests passed');
})();
