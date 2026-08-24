'use strict';
const { test, assert } = require('./harness');
const { parseAtlas, getRegionRect, getNumbers, isRotated } = require('../src/core/atlas-parser');
const { scaleAtlas } = require('../src/core/atlas-scaler');
const { LEGACY_ONE_PAGE, LEGACY_TWO_PAGES, MODERN, TOUCHING } = require('./fixtures/atlases');

function scale(text, factor, sizes) {
    const atlas = parseAtlas(text);
    const pageSizes = sizes || atlas.pages.map((p) => {
        const s = getNumbers(p, 'size');
        return { width: s[0], height: s[1], newWidth: Math.round(s[0] * factor), newHeight: Math.round(s[1] * factor) };
    });
    return scaleAtlas(atlas, { scale: factor, pageSizes });
}

test('50%: page size and region geometry halve', () => {
    const { atlas } = scale(LEGACY_ONE_PAGE, 0.5);
    assert.deepStrictEqual(getNumbers(atlas.pages[0], 'size'), [1024, 1024]);
    assert.deepStrictEqual(getRegionRect(atlas.pages[0].regions[0]), {
        x: 50, y: 100, w: 150, h: 200, offX: 5, offY: 5, origW: 160, origH: 210,
    });
});

test('50%: verbatim keys are untouched', () => {
    const { atlas } = scale(LEGACY_ONE_PAGE, 0.5);
    const region = atlas.pages[0].regions[1];
    assert.strictEqual(isRotated(region), true);
    assert.deepStrictEqual(getNumbers(region, 'index'), [-1]);
    const page = atlas.pages[0];
    assert.strictEqual(page.props.filter((p) => p.key === 'format')[0].values[0], 'RGBA8888');
    assert.strictEqual(page.props.filter((p) => p.key === 'filter')[0].values.join(','), 'Linear,Linear');
    assert.strictEqual(page.props.filter((p) => p.key === 'repeat')[0].values[0], 'none');
});

test('modern dialect scales bounds and offsets', () => {
    const { atlas } = scale(MODERN, 0.5);
    assert.deepStrictEqual(getNumbers(atlas.pages[0].regions[0], 'bounds'), [50, 100, 150, 200]);
    assert.deepStrictEqual(getNumbers(atlas.pages[0].regions[0], 'offsets'), [5, 5, 160, 210]);
    assert.strictEqual(atlas.pages[0].props.filter((p) => p.key === 'pma')[0].values[0], 'true');
});

test('every page in a multi-page atlas is scaled', () => {
    const { atlas, stats } = scale(LEGACY_TWO_PAGES, 0.5);
    assert.deepStrictEqual(getNumbers(atlas.pages[0], 'size'), [512, 512]);
    assert.deepStrictEqual(getNumbers(atlas.pages[1], 'size'), [256, 256]);
    assert.strictEqual(stats.regionCount, 3);
    assert.deepStrictEqual(getRegionRect(atlas.pages[1].regions[0]), {
        // edges round to [1, 256) so the region still ends exactly on the page edge
        x: 1, y: 1, w: 255, h: 255, offX: 0, offY: 0, origW: 255, origH: 255,
    });
});

test('every region stays inside its page at 25%, 50% and 75%', () => {
    [0.25, 0.5, 0.75].forEach((factor) => {
        [LEGACY_ONE_PAGE, LEGACY_TWO_PAGES, MODERN, TOUCHING].forEach((text) => {
            const { atlas, issues } = scale(text, factor);
            assert.ok(!issues.some((i) => i.level === 'error'), 'no errors at ' + factor);
            atlas.pages.forEach((page) => {
                const size = getNumbers(page, 'size');
                page.regions.forEach((region) => {
                    const r = getRegionRect(region);
                    const rot = isRotated(region);
                    const w = rot ? r.h : r.w;
                    const h = rot ? r.w : r.h;
                    assert.ok(r.w >= 1 && r.h >= 1, region.name + ' keeps a positive size');
                    assert.ok(r.x >= 0 && r.y >= 0, region.name + ' stays non-negative');
                    assert.ok(r.x + w <= size[0], region.name + ' fits horizontally at ' + factor);
                    assert.ok(r.y + h <= size[1], region.name + ' fits vertically at ' + factor);
                    assert.ok(r.offX + r.w <= r.origW, region.name + ' trim stays consistent (x)');
                    assert.ok(r.offY + r.h <= r.origH, region.name + ' trim stays consistent (y)');
                });
            });
        });
    });
});

test('edge rounding keeps touching regions touching (no gap, no overlap)', () => {
    const { atlas } = scale(TOUCHING, 0.75, [{ width: 100, height: 100, newWidth: 75, newHeight: 75 }]);
    const rects = atlas.pages[0].regions.map(getRegionRect);
    assert.strictEqual(rects[0].x + rects[0].w, rects[1].x);
    assert.strictEqual(rects[1].x + rects[1].w, rects[2].x);
    assert.strictEqual(rects[2].x + rects[2].w, 75);
});

test('regions never collapse below 1px and tiny ones are reported', () => {
    const { atlas, issues } = scale(LEGACY_ONE_PAGE, 0.25);
    const pixel = getRegionRect(atlas.pages[0].regions[2]);
    assert.ok(pixel.w >= 1 && pixel.h >= 1);
    assert.ok(issues.some((i) => i.code === 'REGION_TINY'), 'tiny region warning raised');
});

test('100% is a no-op on the numbers', () => {
    const { atlas } = scale(LEGACY_ONE_PAGE, 1);
    assert.deepStrictEqual(getRegionRect(atlas.pages[0].regions[0]), {
        x: 100, y: 200, w: 300, h: 400, offX: 10, offY: 10, origW: 320, origH: 420,
    });
});

test('page size comes from the real image, not the declared one', () => {
    const { atlas } = scale(LEGACY_ONE_PAGE, 0.5, [{ width: 1000, height: 800, newWidth: 500, newHeight: 400 }]);
    assert.deepStrictEqual(getNumbers(atlas.pages[0], 'size'), [500, 400]);
});
