'use strict';
/**
 * Editor entry point. Everything here is glue: path conversion (db:// <-> fs),
 * the asset-database refresh and progress plumbing. All real work lives in
 * ./src/core so it can run in the CLI and the tests without the editor.
 */

const fs = require('fs');
const path = require('path');
const { analyzeOnly, generate } = require('./src/core/generator');

/** Shared state so the panel can poll progress and cancel a run. */
const state = {
    running: false,
    percent: 0,
    message: '',
    log: [],
    cancelToken: { cancelled: false },
};

async function dbToFs(url) {
    if (!url) {
        return '';
    }
    if (!url.startsWith('db://')) {
        return path.normalize(url);
    }
    const result = await Editor.Message.request('asset-db', 'query-path', url);
    return result ? path.normalize(result) : '';
}

async function fsToDb(fsPath) {
    if (!fsPath) {
        return '';
    }
    try {
        const url = await Editor.Message.request('asset-db', 'query-url', fsPath);
        return url || '';
    } catch (e) {
        return '';
    }
}

/**
 * Output folders are usually given as db:// urls for folders that do not exist
 * yet, so `query-path` returns nothing. Resolve them against the project root.
 */
async function resolveOutputDir(url) {
    if (!url) {
        return '';
    }
    if (!url.startsWith('db://')) {
        return path.normalize(url);
    }
    const direct = await Editor.Message.request('asset-db', 'query-path', url).catch(() => null);
    if (direct) {
        return path.normalize(direct);
    }
    // Walk up until an existing ancestor is found, then re-append the tail.
    const parts = url.replace(/\/+$/, '').split('/');
    const tail = [];
    while (parts.length > 2) {
        tail.unshift(parts.pop());
        const parent = parts.join('/');
        const parentPath = await Editor.Message.request('asset-db', 'query-path', parent).catch(() => null);
        if (parentPath) {
            return path.normalize(path.join(parentPath, tail.join(path.sep)));
        }
    }
    return path.normalize(path.join(Editor.Project.path, url.replace('db://', '')));
}

async function buildPlan(options) {
    const atlasPath = await dbToFs(options.atlasUrl);
    const outputDir = await resolveOutputDir(options.outputUrl);
    return {
        atlasPath,
        outputDir,
        scale: Number(options.scale) || 0.5,
        filter: options.filter || 'lanczos3',
        mode: options.mode === 'B' ? 'B' : 'A',
        overwrite: !!options.overwrite,
        backup: options.backup !== false,
        mipmaps: !!options.mipmaps,
    };
}

exports.methods = {
    openPanel() {
        Editor.Panel.open('spine-texture-optimizer');
    },

    /** Dry run: no file is written. */
    async analyze(options) {
        const plan = await buildPlan(options);
        if (!plan.atlasPath || !fs.existsSync(plan.atlasPath)) {
            return { ok: false, error: 'Atlas file not found: ' + (options.atlasUrl || '(empty)') };
        }
        try {
            const info = analyzeOnly(plan);
            info.plan = plan;
            return { ok: true, info };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async generate(options) {
        if (state.running) {
            return { ok: false, error: 'A generate run is already in progress.' };
        }
        const plan = await buildPlan(options);
        if (!plan.atlasPath || !fs.existsSync(plan.atlasPath)) {
            return { ok: false, error: 'Atlas file not found: ' + (options.atlasUrl || '(empty)') };
        }
        state.running = true;
        state.percent = 0;
        state.message = 'Starting...';
        state.log = [];
        state.cancelToken = { cancelled: false };
        try {
            const result = await generate(
                plan,
                (p) => {
                    state.percent = p.percent;
                    state.message = p.message;
                    state.log.push(p.message);
                    console.log('[spine-texture-optimizer] ' + p.message);
                },
                state.cancelToken
            );
            let outputUrl = '';
            if (options.refresh !== false) {
                state.message = 'Refreshing asset database...';
                const parentUrl = (options.outputUrl || '').replace(/\/[^/]+\/?$/, '');
                if (parentUrl.startsWith('db://')) {
                    await Editor.Message.request('asset-db', 'refresh-asset', parentUrl).catch(() => null);
                }
                outputUrl = await fsToDb(result.outputDir);
                if (outputUrl) {
                    await Editor.Message.request('asset-db', 'refresh-asset', outputUrl).catch(() => null);
                }
            }
            result.outputUrl = outputUrl;
            result.plan = plan;
            return { ok: true, result };
        } catch (e) {
            return { ok: false, error: e.message, cancelled: !!e.cancelled, log: e.log || state.log };
        } finally {
            state.running = false;
            state.percent = 100;
        }
    },

    progressStatus() {
        return { running: state.running, percent: state.percent, message: state.message, log: state.log.slice(-40) };
    },

    cancel() {
        state.cancelToken.cancelled = true;
        return { ok: true };
    },

    /** Native file picker; returns both the fs path and the db:// url. */
    async browseAtlas(currentUrl) {
        const start = (await dbToFs(currentUrl)) || Editor.Project.path;
        const result = await Editor.Dialog.select({
            title: 'Select a Spine .atlas file',
            path: fs.existsSync(start) ? (fs.statSync(start).isDirectory() ? start : path.dirname(start)) : Editor.Project.path,
            type: 'file',
            filters: [{ name: 'Spine Atlas', extensions: ['atlas', 'txt'] }],
        });
        if (!result || result.canceled || !result.filePaths || !result.filePaths.length) {
            return { ok: false };
        }
        const file = result.filePaths[0];
        return { ok: true, path: file, url: await fsToDb(file) };
    },

    async toFsPath(url) {
        return dbToFs(url);
    },

    reveal(target) {
        try {
            require('electron').shell.showItemInFolder(target);
        } catch (e) {
            console.warn('[spine-texture-optimizer] cannot reveal ' + target + ': ' + e.message);
        }
    },
};

exports.load = function () {};
exports.unload = function () {};
