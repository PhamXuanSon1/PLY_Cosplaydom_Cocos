'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, assert } = require('./harness');
const { encodePng } = require('../src/core/png-codec');
const { generate, analyzeOnly, rmrf } = require('../src/core/generator');
const { parseAtlas, getNumbers } = require('../src/core/atlas-parser');
const { analyzeSpine } = require('../src/core/spine-analyzer');

function tmpdir(name) {
    const dir = path.join(os.tmpdir(), 'spine-opt-test-' + name + '-' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function writePng(file, width, height) {
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = i % 255;
        data[i * 4 + 1] = 128;
        data[i * 4 + 2] = 255 - (i % 255);
        data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(file, encodePng({ width, height, data }, { forceRgba: true }));
}

/** A realistic two-page export: hero.json + hero.atlas + hero_0.png + hero_1.png */
function makeSpineFolder() {
    const root = tmpdir('src');
    const dir = path.join(root, 'hero');
    fs.mkdirSync(dir);
    writePng(path.join(dir, 'hero_0.png'), 256, 256);
    writePng(path.join(dir, 'hero_1.png'), 128, 128);
    fs.writeFileSync(
        path.join(dir, 'hero.atlas'),
        [
            '',
            'hero_0.png',
            'size: 256,256',
            'format: RGBA8888',
            'filter: Linear,Linear',
            'repeat: none',
            'head',
            '  rotate: false',
            '  xy: 4, 4',
            '  size: 100, 120',
            '  orig: 110, 130',
            '  offset: 5, 5',
            '  index: -1',
            '',
            'hero_1.png',
            'size: 128,128',
            'format: RGBA8888',
            'filter: Linear,Linear',
            'repeat: none',
            'cape',
            '  rotate: true',
            '  xy: 2, 2',
            '  size: 60, 40',
            '  orig: 60, 40',
            '  offset: 0, 0',
            '  index: -1',
            '',
        ].join('\n')
    );
    fs.writeFileSync(
        path.join(dir, 'hero.json'),
        JSON.stringify({ skeleton: { spine: '4.0.64', hash: 'abc' }, bones: [{ name: 'root' }], slots: [], animations: {} })
    );
    return { root, dir };
}

test('analyzer finds pages, real sizes and the skeleton', () => {
    const { root, dir } = makeSpineFolder();
    try {
        const info = analyzeSpine(path.join(dir, 'hero.atlas'));
        assert.strictEqual(info.pages.length, 2);
        assert.strictEqual(info.pages[0].width, 256);
        assert.strictEqual(info.pages[1].width, 128);
        assert.strictEqual(info.skeletons.length, 1);
        assert.strictEqual(info.skeletons[0].version, '4.0.64');
        assert.ok(!info.issues.some((i) => i.level === 'error'));
    } finally {
        rmrf(root);
    }
});

test('analyze reports the declared-vs-real size mismatch', () => {
    const { root, dir } = makeSpineFolder();
    try {
        const atlasFile = path.join(dir, 'hero.atlas');
        fs.writeFileSync(atlasFile, fs.readFileSync(atlasFile, 'utf8').replace('size: 256,256', 'size: 512,512'));
        const info = analyzeOnly({ atlasPath: atlasFile, outputDir: path.join(root, 'out'), scale: 0.5 });
        assert.ok(info.issues.some((i) => i.code === 'PAGE_SIZE_MISMATCH'));
        assert.strictEqual(info.pages[0].newWidth, 128, 'uses the real 256px size, not the declared 512');
    } finally {
        rmrf(root);
    }
});

test('generate writes a complete scaled folder and leaves the source untouched', async () => {
    const { root, dir } = makeSpineFolder();
    const outDir = path.join(root, 'hero_scaled_50');
    const before = fs.readdirSync(dir).map((n) => [n, fs.statSync(path.join(dir, n)).size]);
    try {
        const result = await generate({
            atlasPath: path.join(dir, 'hero.atlas'),
            outputDir: outDir,
            scale: 0.5,
            filter: 'lanczos3',
            mode: 'A',
        });

        assert.deepStrictEqual(fs.readdirSync(outDir).sort(), ['hero.atlas', 'hero.json', 'hero_0.png', 'hero_1.png']);

        const atlas = parseAtlas(fs.readFileSync(path.join(outDir, 'hero.atlas'), 'utf8'));
        assert.deepStrictEqual(getNumbers(atlas.pages[0], 'size'), [128, 128]);
        assert.deepStrictEqual(getNumbers(atlas.pages[1], 'size'), [64, 64]);
        assert.deepStrictEqual(getNumbers(atlas.pages[0].regions[0], 'xy'), [2, 2]);
        assert.deepStrictEqual(getNumbers(atlas.pages[0].regions[0], 'size'), [50, 60]);

        assert.strictEqual(result.pages.length, 2);
        assert.strictEqual(result.pages[0].newWidth, 128);
        assert.ok(result.bytesOut < result.bytesIn, 'output is smaller on disk');

        // Skeleton copied byte for byte.
        assert.ok(
            fs.readFileSync(path.join(outDir, 'hero.json')).equals(fs.readFileSync(path.join(dir, 'hero.json'))),
            'skeleton json is identical'
        );

        // Source folder untouched.
        assert.deepStrictEqual(fs.readdirSync(dir).map((n) => [n, fs.statSync(path.join(dir, n)).size]), before);
    } finally {
        rmrf(root);
    }
});

test('generate refuses to write into the source folder', async () => {
    const { root, dir } = makeSpineFolder();
    try {
        let failed = false;
        try {
            await generate({ atlasPath: path.join(dir, 'hero.atlas'), outputDir: dir, scale: 0.5 });
        } catch (e) {
            failed = /OUTPUT_IS_SOURCE|source folder/i.test(e.message + JSON.stringify(e.issues || []));
        }
        assert.ok(failed, 'generating over the source is blocked');
    } finally {
        rmrf(root);
    }
});

test('generate leaves no temp folder behind when a page is corrupt', async () => {
    const { root, dir } = makeSpineFolder();
    try {
        fs.writeFileSync(path.join(dir, 'hero_1.png'), Buffer.from('not a png at all'));
        let failed = false;
        try {
            await generate({ atlasPath: path.join(dir, 'hero.atlas'), outputDir: path.join(root, 'out'), scale: 0.5 });
        } catch (e) {
            failed = true;
        }
        assert.ok(failed, 'corrupt page aborts the run');
        const leftovers = fs.readdirSync(root).filter((n) => n.indexOf('.tmp-') !== -1);
        assert.deepStrictEqual(leftovers, [], 'no temp folder left behind');
        assert.ok(!fs.existsSync(path.join(root, 'out')), 'no half-written output folder');
    } finally {
        rmrf(root);
    }
});

test('a cancel between pages rolls everything back', async () => {
    const { root, dir } = makeSpineFolder();
    try {
        const token = { cancelled: false };
        let failed = null;
        try {
            await generate(
                { atlasPath: path.join(dir, 'hero.atlas'), outputDir: path.join(root, 'out'), scale: 0.5 },
                () => { token.cancelled = true; },
                token
            );
        } catch (e) {
            failed = e;
        }
        assert.ok(failed && failed.cancelled, 'cancellation surfaced');
        assert.ok(!fs.existsSync(path.join(root, 'out')), 'nothing written');
    } finally {
        rmrf(root);
    }
});
