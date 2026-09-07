'use strict';
/**
 * Editor entry point: asset-db path conversion, input collection, the resize
 * loop with progress, backups and asset refresh. Pixel work lives in ./src/core.
 */

const fs = require('fs');
const path = require('path');
const { computeTarget, buildOutputPath, isImageFile } = require('./src/core/plan');
const { probeImageFile } = require('./src/core/probe');
const { resizeFile, findFfmpeg } = require('./src/core/resize-file');
const { mkdirp } = require('./src/core/fsx');

const PKG = 'image-resizer';

const state = {
    running: false,
    percent: 0,
    message: '',
    log: [],
    cancelled: false,
};

function log(message) {
    state.log.push(message);
    console.log('[' + PKG + '] ' + message);
}

// ---------------------------------------------------------------- paths

async function dbToFs(url) {
    if (!url) {
        return '';
    }
    if (!url.startsWith('db://')) {
        return path.normalize(url);
    }
    const result = await Editor.Message.request('asset-db', 'query-path', url).catch(() => null);
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

/** db:// folder that may not exist yet -> fs path. */
async function resolveFolder(url) {
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
    const parts = url.replace(/\/+$/, '').split('/');
    const tail = [];
    while (parts.length > 2) {
        tail.unshift(parts.pop());
        const parentPath = await Editor.Message.request('asset-db', 'query-path', parts.join('/')).catch(() => null);
        if (parentPath) {
            return path.normalize(path.join(parentPath, tail.join(path.sep)));
        }
    }
    return path.normalize(path.join(Editor.Project.path, url.replace('db://', '')));
}

async function assetInfo(uuidOrUrl) {
    try {
        return await Editor.Message.request('asset-db', 'query-asset-info', uuidOrUrl);
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------------- inputs

function walkImages(dir, out) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkImages(full, out);
        } else if (entry.isFile() && isImageFile(full)) {
            out.push(full);
        }
    }
}

/**
 * Accepts uuids, db:// urls and fs paths (files or folders) and returns a flat
 * list of image files with their size.
 */
async function expandInputs(items) {
    const files = [];
    const errors = [];
    for (const raw of items || []) {
        const item = String(raw || '').trim();
        if (!item) {
            continue;
        }
        let fsPath = '';
        if (item.startsWith('db://')) {
            fsPath = await dbToFs(item);
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item) || /^[0-9a-zA-Z+/]{22,23}$/.test(item)) {
            const info = await assetInfo(item);
            fsPath = info && info.file ? path.normalize(info.file) : '';
        } else {
            fsPath = path.normalize(item);
        }
        if (!fsPath || !fs.existsSync(fsPath)) {
            errors.push('Not found: ' + item);
            continue;
        }
        const stat = fs.statSync(fsPath);
        if (stat.isDirectory()) {
            walkImages(fsPath, files);
        } else if (isImageFile(fsPath)) {
            files.push(fsPath);
        } else {
            errors.push('Not an image: ' + path.basename(fsPath));
        }
    }
    const unique = Array.from(new Set(files.map((f) => path.normalize(f))));
    const rows = [];
    for (const file of unique) {
        try {
            const info = probeImageFile(file);
            rows.push({
                path: file,
                url: await fsToDb(file),
                name: path.basename(file),
                width: info.width,
                height: info.height,
                format: info.format,
                bytes: fs.statSync(file).size,
            });
        } catch (e) {
            errors.push(path.basename(file) + ': ' + e.message);
        }
    }
    return { files: rows, errors };
}

// ---------------------------------------------------------------- planning

function targetOptions(o) {
    return {
        mode: o.mode || 'percent',
        percent: Number(o.percent) || 50,
        boxWidth: Number(o.boxWidth) || 0,
        boxHeight: Number(o.boxHeight) || 0,
        target: Number(o.target) || 0,
        allowUpscale: !!o.allowUpscale,
        multipleOf: Number(o.multipleOf) || 1,
    };
}

async function buildPlan(options) {
    const o = options || {};
    const tOpts = targetOptions(o);
    const outMode = o.output || 'inplace';
    const folder = outMode === 'folder' ? await resolveFolder(o.folderUrl) : '';
    if (outMode === 'folder' && !folder) {
        throw new Error('Output folder is empty.');
    }
    const outOpts = { output: outMode, suffix: o.suffix || '', folder, format: o.format || 'keep' };

    const rows = [];
    for (const file of o.files || []) {
        const row = { path: file, name: path.basename(file), ok: true, error: '', skipped: false };
        try {
            if (!fs.existsSync(file)) {
                throw new Error('file not found');
            }
            const info = probeImageFile(file);
            row.width = info.width;
            row.height = info.height;
            row.format = info.format;
            row.bytesIn = fs.statSync(file).size;
            const dims = computeTarget(info.width, info.height, tOpts);
            row.newWidth = dims.newWidth;
            row.newHeight = dims.newHeight;
            row.scale = dims.scale;
            row.outputPath = buildOutputPath(file, outOpts, dims);
            const formatChanges = path.extname(row.outputPath).toLowerCase() !== path.extname(file).toLowerCase();
            if (!dims.changed && !formatChanges) {
                row.skipped = true;
                row.reason = dims.reason;
            } else {
                row.reason = dims.reason;
            }
            if (outMode === 'suffix' && path.normalize(row.outputPath) === path.normalize(file)) {
                throw new Error('suffix produces the same file name');
            }
        } catch (e) {
            row.ok = false;
            row.error = e.message;
        }
        rows.push(row);
    }
    return {
        rows,
        output: outMode,
        folder,
        filter: o.filter || 'lanczos3',
        quality: Number(o.quality) || 85,
        backup: o.backup !== false,
        refresh: o.refresh !== false,
        engineForOthers: findFfmpeg() ? 'ffmpeg' : process.platform === 'win32' ? 'powershell' : 'none',
    };
}

function backupRoot() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    return path.join(Editor.Project.path, 'temp', 'image-resizer-backup', stamp);
}

function backupFile(file, root) {
    const rel = path.relative(Editor.Project.path, file);
    const safeRel = rel.startsWith('..') ? path.basename(file) : rel;
    const dest = path.join(root, safeRel);
    mkdirp(path.dirname(dest));
    fs.copyFileSync(file, dest);
    return dest;
}

// ---------------------------------------------------------------- methods

exports.methods = {
    openPanel() {
        Editor.Panel.open(PKG);
    },

    /** Images (or folders) currently selected in the Assets panel. */
    async collectSelected() {
        let uuids = [];
        try {
            uuids = Editor.Selection.getSelected('asset') || [];
        } catch (e) {
            uuids = [];
        }
        if (!uuids.length) {
            return { ok: false, error: 'Nothing is selected in the Assets panel.' };
        }
        const result = await expandInputs(uuids);
        return { ok: true, files: result.files, errors: result.errors };
    },

    async resolveInputs(items) {
        const result = await expandInputs(items);
        return { ok: true, files: result.files, errors: result.errors };
    },

    async browseFiles() {
        const result = await Editor.Dialog.select({
            title: 'Select images',
            path: path.join(Editor.Project.path, 'assets'),
            type: 'file',
            multi: true,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
        });
        if (!result || result.canceled || !result.filePaths || !result.filePaths.length) {
            return { ok: false };
        }
        const expanded = await expandInputs(result.filePaths);
        return { ok: true, files: expanded.files, errors: expanded.errors };
    },

    async browseFolder(currentUrl) {
        const start = (await resolveFolder(currentUrl)) || path.join(Editor.Project.path, 'assets');
        const result = await Editor.Dialog.select({
            title: 'Select output folder',
            path: fs.existsSync(start) ? start : Editor.Project.path,
            type: 'directory',
        });
        if (!result || result.canceled || !result.filePaths || !result.filePaths.length) {
            return { ok: false };
        }
        const dir = result.filePaths[0];
        return { ok: true, path: dir, url: (await fsToDb(dir)) || dir };
    },

    /** Dry run: computes sizes and output paths, writes nothing. */
    async analyze(options) {
        try {
            const plan = await buildPlan(options);
            return { ok: true, plan };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async run(options) {
        if (state.running) {
            return { ok: false, error: 'A resize run is already in progress.' };
        }
        state.running = true;
        state.cancelled = false;
        state.percent = 0;
        state.message = 'Planning...';
        state.log = [];
        try {
            const plan = await buildPlan(options);
            const todo = plan.rows.filter((r) => r.ok && !r.skipped);
            if (!todo.length) {
                throw new Error('Nothing to do: every file is skipped or invalid.');
            }
            const root = plan.output === 'inplace' && plan.backup ? backupRoot() : '';
            let done = 0;
            let bytesIn = 0;
            let bytesOut = 0;
            const touchedDirs = new Set();
            for (const row of todo) {
                if (state.cancelled) {
                    row.ok = false;
                    row.error = 'cancelled';
                    continue;
                }
                state.message = 'Resizing ' + row.name + ' (' + (done + 1) + '/' + todo.length + ')';
                try {
                    if (root) {
                        row.backupPath = backupFile(row.path, root);
                    }
                    const res = await resizeFile(row.path, row.outputPath, {
                        newWidth: row.newWidth,
                        newHeight: row.newHeight,
                        filter: plan.filter,
                        quality: plan.quality,
                    });
                    row.engine = res.engine;
                    row.bytesOut = res.bytesOut;
                    bytesIn += res.bytesIn;
                    bytesOut += res.bytesOut;
                    touchedDirs.add(path.dirname(row.outputPath));
                    log(
                        row.name + ': ' + row.width + 'x' + row.height + ' -> ' + row.newWidth + 'x' + row.newHeight +
                        '  ' + fmt(res.bytesIn) + ' -> ' + fmt(res.bytesOut) + '  [' + res.engine + ']'
                    );
                } catch (e) {
                    row.ok = false;
                    row.error = e.message;
                    log('ERROR ' + row.name + ': ' + e.message);
                }
                done += 1;
                state.percent = Math.round((done / todo.length) * 100);
            }

            let refreshed = [];
            if (plan.refresh && touchedDirs.size) {
                state.message = 'Refreshing asset database...';
                for (const dir of touchedDirs) {
                    const url = await fsToDb(dir);
                    if (url) {
                        await Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => null);
                        refreshed.push(url);
                    }
                }
            }
            state.message = state.cancelled ? 'Cancelled.' : 'Done.';
            return {
                ok: true,
                result: {
                    rows: plan.rows,
                    bytesIn,
                    bytesOut,
                    backupRoot: root,
                    refreshed,
                    cancelled: state.cancelled,
                    log: state.log.slice(),
                },
            };
        } catch (e) {
            log('ERROR ' + e.message);
            return { ok: false, error: e.message, log: state.log.slice() };
        } finally {
            state.running = false;
            state.percent = 100;
        }
    },

    progressStatus() {
        return { running: state.running, percent: state.percent, message: state.message, log: state.log.slice(-60) };
    },

    cancel() {
        state.cancelled = true;
        return { ok: true };
    },

    reveal(target) {
        try {
            require('electron').shell.showItemInFolder(target);
        } catch (e) {
            console.warn('[' + PKG + '] cannot reveal ' + target + ': ' + e.message);
        }
    },
};

function fmt(n) {
    if (n < 1024) {
        return n + ' B';
    }
    if (n < 1024 * 1024) {
        return (n / 1024).toFixed(1) + ' KB';
    }
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

exports.load = function () {};
exports.unload = function () {};
