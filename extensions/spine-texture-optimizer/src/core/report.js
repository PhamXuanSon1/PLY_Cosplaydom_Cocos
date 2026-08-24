'use strict';
/** Size / VRAM estimates shown in the panel and printed by the CLI. */

const MIPMAP_FACTOR = 4 / 3;

function vramBytes(width, height, mipmaps) {
    const base = width * height * 4;
    return mipmaps ? Math.round(base * MIPMAP_FACTOR) : base;
}

function formatBytes(bytes) {
    if (!isFinite(bytes)) {
        return '-';
    }
    if (bytes < 1024) {
        return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * @param {ReturnType<typeof import('./spine-analyzer').analyzeSpine>} analysis
 * @param {{scale:number, mipmaps?:boolean}} plan
 * @param {Array<{newWidth:number,newHeight:number}>} pageSizes
 */
function estimate(analysis, plan, pageSizes) {
    const pages = analysis.pages.map((page, i) => {
        const target = pageSizes[i] || { newWidth: page.width, newHeight: page.height };
        return {
            name: page.name,
            width: page.width,
            height: page.height,
            newWidth: target.newWidth,
            newHeight: target.newHeight,
            diskBytes: page.bytes,
            // PNG size scales roughly with the pixel count; good enough for a preview.
            diskBytesEstimate: Math.round(page.bytes * plan.scale * plan.scale),
            vramBytes: vramBytes(page.width, page.height, plan.mipmaps),
            newVramBytes: vramBytes(target.newWidth, target.newHeight, plan.mipmaps),
        };
    });
    const sum = (key) => pages.reduce((acc, p) => acc + p[key], 0);
    return {
        pageCount: pages.length,
        pages,
        diskBytes: sum('diskBytes'),
        diskBytesEstimate: sum('diskBytesEstimate'),
        vramBytes: sum('vramBytes'),
        newVramBytes: sum('newVramBytes'),
    };
}

module.exports = { estimate, vramBytes, formatBytes, MIPMAP_FACTOR };
