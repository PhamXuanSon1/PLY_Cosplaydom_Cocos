'use strict';
const { test, assert } = require('./harness');
const { parseAtlas, serializeAtlas, getRegionRect, isRotated, getNumbers } = require('../src/core/atlas-parser');
const { LEGACY_ONE_PAGE, LEGACY_TWO_PAGES, MODERN, ODD_NAMES } = require('./fixtures/atlases');

test('legacy: parses one page with its regions', () => {
    const atlas = parseAtlas(LEGACY_ONE_PAGE);
    assert.strictEqual(atlas.format, 'legacy');
    assert.strictEqual(atlas.pages.length, 1);
    assert.strictEqual(atlas.pages[0].name, 'hero.png');
    assert.deepStrictEqual(getNumbers(atlas.pages[0], 'size'), [2048, 2048]);
    assert.strictEqual(atlas.pages[0].regions.length, 3);
    assert.strictEqual(atlas.pages[0].regions[0].name, 'hero_head');
});

test('legacy: region geometry is normalized', () => {
    const region = parseAtlas(LEGACY_ONE_PAGE).pages[0].regions[0];
    assert.deepStrictEqual(getRegionRect(region), {
        x: 100, y: 200, w: 300, h: 400, offX: 10, offY: 10, origW: 320, origH: 420,
    });
});

test('legacy: rotate flag is read', () => {
    const page = parseAtlas(LEGACY_ONE_PAGE).pages[0];
    assert.strictEqual(isRotated(page.regions[0]), false);
    assert.strictEqual(isRotated(page.regions[1]), true);
});

test('multi page: every page and its regions land on the right page', () => {
    const atlas = parseAtlas(LEGACY_TWO_PAGES);
    assert.strictEqual(atlas.pages.length, 2);
    assert.deepStrictEqual(atlas.pages.map((p) => p.name), ['hero_0.png', 'hero_1.png']);
    assert.strictEqual(atlas.pages[0].regions.length, 2);
    assert.strictEqual(atlas.pages[1].regions.length, 1);
    assert.strictEqual(atlas.pages[1].regions[0].name, 'hero_cape');
});

test('multi page: a region literally named like a png is not treated as a page', () => {
    const atlas = parseAtlas(LEGACY_TWO_PAGES);
    const names = atlas.pages[0].regions.map((r) => r.name);
    assert.ok(names.indexOf('effects/spark.png') !== -1, 'region named *.png stayed a region');
    assert.strictEqual(atlas.pages.length, 2);
});

test('modern: bounds/offsets dialect', () => {
    const atlas = parseAtlas(MODERN);
    assert.strictEqual(atlas.format, 'modern');
    const region = atlas.pages[0].regions[0];
    assert.deepStrictEqual(getRegionRect(region), {
        x: 100, y: 200, w: 300, h: 400, offX: 10, offY: 10, origW: 320, origH: 420,
    });
    assert.strictEqual(isRotated(region), true, 'rotate: 90 counts as rotated');
});

test('modern: region without offsets falls back to bounds size', () => {
    const region = parseAtlas(MODERN).pages[0].regions[1];
    const rect = getRegionRect(region);
    assert.strictEqual(rect.origW, rect.w);
    assert.strictEqual(rect.offX, 0);
});

test('names with spaces, slashes, colons and digits survive', () => {
    const atlas = parseAtlas(ODD_NAMES);
    const names = atlas.pages[0].regions.map((r) => r.name);
    assert.deepStrictEqual(names, ['left arm', 'fx/glow 2', 'weird:name', 'rotate_but_not_a_key']);
});

test('serialize is a byte-exact round trip', () => {
    [LEGACY_ONE_PAGE, LEGACY_TWO_PAGES, MODERN, ODD_NAMES].forEach((text) => {
        assert.strictEqual(serializeAtlas(parseAtlas(text)), text);
    });
});

test('CRLF atlases round trip as CRLF', () => {
    const crlf = LEGACY_ONE_PAGE.split('\n').join('\r\n');
    const atlas = parseAtlas(crlf);
    assert.strictEqual(atlas.eol, '\r\n');
    assert.strictEqual(serializeAtlas(atlas), crlf);
});
