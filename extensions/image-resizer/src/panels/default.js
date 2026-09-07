'use strict';

const fs = require('fs');
const path = require('path');
const { formatBytes } = require('../core/plan');

const PKG = 'image-resizer';
const STATIC = path.join(__dirname, '..', '..', 'static');

exports.template = fs.readFileSync(path.join(STATIC, 'template', 'default.html'), 'utf8');
exports.style = fs.readFileSync(path.join(STATIC, 'style', 'default.css'), 'utf8');

exports.$ = {
    drop: '#drop',
    addSelected: '#addSelected',
    browse: '#browse',
    clear: '#clear',
    fileList: '#fileList',
    mode: '#mode',
    rowPercent: '#rowPercent',
    percent: '#percent',
    presets: '#presets',
    rowBox: '#rowBox',
    boxWidth: '#boxWidth',
    boxHeight: '#boxHeight',
    rowTarget: '#rowTarget',
    targetLabel: '#targetLabel',
    target: '#target',
    allowUpscale: '#allowUpscale',
    multipleOf: '#multipleOf',
    filter: '#filter',
    output: '#output',
    rowSuffix: '#rowSuffix',
    suffix: '#suffix',
    rowFolder: '#rowFolder',
    folder: '#folder',
    browseFolder: '#browseFolder',
    format: '#format',
    quality: '#quality',
    backup: '#backup',
    refresh: '#refresh',
    preview: '#preview',
    resize: '#resize',
    cancelBtn: '#cancelBtn',
    revealBackup: '#revealBackup',
    progressWrap: '#progressWrap',
    progress: '#progress',
    progressText: '#progressText',
    issues: '#issues',
    result: '#result',
    logWrap: '#logWrap',
    log: '#log',
};

/** @type {Array<{path:string,url:string,name:string,width:number,height:number,bytes:number,format:string}>} */
let files = [];
let lastBackupRoot = '';
let pollTimer = null;

function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function loadPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PKG) || '{}');
    } catch (e) {
        return {};
    }
}

function savePrefs(prefs) {
    try {
        localStorage.setItem(PKG, JSON.stringify(prefs));
    } catch (e) {
        /* convenience only */
    }
}

function displayName(f) {
    return f.url || f.path;
}

exports.methods = {
    collect() {
        return {
            files: files.map((f) => f.path),
            mode: this.$.mode.value,
            percent: Number(this.$.percent.value),
            boxWidth: Number(this.$.boxWidth.value),
            boxHeight: Number(this.$.boxHeight.value),
            target: Number(this.$.target.value),
            allowUpscale: !!this.$.allowUpscale.value,
            multipleOf: Number(this.$.multipleOf.value),
            filter: this.$.filter.value,
            output: this.$.output.value,
            suffix: this.$.suffix.value,
            folderUrl: this.$.folder.value.trim(),
            format: this.$.format.value,
            quality: Number(this.$.quality.value),
            backup: !!this.$.backup.value,
            refresh: !!this.$.refresh.value,
        };
    },

    updateVisibility() {
        const mode = this.$.mode.value;
        this.$.rowPercent.classList.toggle('hidden', mode !== 'percent');
        this.$.rowBox.classList.toggle('hidden', mode !== 'fit');
        const single = mode === 'width' || mode === 'height' || mode === 'longest';
        this.$.rowTarget.classList.toggle('hidden', !single);
        this.$.targetLabel.value = mode === 'width' ? 'Width' : mode === 'height' ? 'Height' : 'Longest side';

        const out = this.$.output.value;
        this.$.rowSuffix.classList.toggle('hidden', out !== 'suffix');
        this.$.rowFolder.classList.toggle('hidden', out !== 'folder');
        this.$.backup.parentElement.classList.toggle('hidden', false);
        this.$.backup.disabled = out !== 'inplace';
    },

    setBusy(busy) {
        this.$.preview.disabled = busy;
        this.$.resize.disabled = busy;
        this.$.cancelBtn.disabled = !busy;
        this.$.progressWrap.classList.toggle('hidden', !busy);
    },

    showIssues(issues) {
        if (!issues || !issues.length) {
            this.$.issues.classList.add('hidden');
            this.$.issues.innerHTML = '';
            return;
        }
        const rows = issues
            .map((i) => '<div class="issue"><span class="tag ' + i.level + '">' + i.level.toUpperCase() + '</span><span>' + escapeHtml(i.message) + '</span></div>')
            .join('');
        this.$.issues.innerHTML = rows;
        this.$.issues.classList.remove('hidden');
    },

    addFiles(list, errors) {
        const known = new Set(files.map((f) => f.path.toLowerCase()));
        let added = 0;
        for (const f of list || []) {
            const key = f.path.toLowerCase();
            if (known.has(key)) {
                continue;
            }
            known.add(key);
            files.push(f);
            added += 1;
        }
        this.renderFiles();
        const issues = (errors || []).map((m) => ({ level: 'warning', message: m }));
        if (!added && !(list || []).length) {
            issues.push({ level: 'info', message: 'No image files found.' });
        }
        this.showIssues(issues);
        this.$.result.classList.add('hidden');
    },

    renderFiles() {
        if (!files.length) {
            this.$.fileList.classList.add('hidden');
            this.$.fileList.innerHTML = '';
            return;
        }
        const total = files.reduce((s, f) => s + f.bytes, 0);
        const rows = files
            .map(
                (f, i) =>
                    '<tr><td class="name" title="' + escapeHtml(f.path) + '">' + escapeHtml(displayName(f)) + '</td>' +
                    '<td class="num">' + f.width + '&times;' + f.height + '</td>' +
                    '<td class="num">' + formatBytes(f.bytes) + '</td>' +
                    '<td class="num"><span class="rm" data-i="' + i + '" title="Remove">&#10005;</span></td></tr>'
            )
            .join('');
        this.$.fileList.innerHTML =
            '<table><tr><th>' + files.length + ' file(s), ' + formatBytes(total) + '</th><th class="num">Size</th><th class="num">Bytes</th><th></th></tr>' + rows + '</table>';
        this.$.fileList.classList.remove('hidden');
        const self = this;
        this.$.fileList.querySelectorAll('.rm').forEach((el) => {
            el.addEventListener('click', () => {
                files.splice(Number(el.getAttribute('data-i')), 1);
                self.renderFiles();
            });
        });
    },

    renderPlan(plan, done) {
        const rows = plan.rows
            .map((r) => {
                let status;
                let cls = '';
                if (!r.ok) {
                    status = 'ERROR: ' + r.error;
                    cls = 'delta-bad';
                } else if (r.skipped) {
                    status = 'skip - ' + r.reason;
                    cls = 'muted';
                } else if (done) {
                    const saving = r.bytesOut != null && r.bytesIn ? Math.round((1 - r.bytesOut / r.bytesIn) * 100) : 0;
                    status = formatBytes(r.bytesOut) + ' (' + (saving >= 0 ? '-' : '+') + Math.abs(saving) + '%) [' + (r.engine || '') + ']';
                    cls = saving > 0 ? 'delta-good' : 'delta-bad';
                } else {
                    status = 'will write ' + path.basename(r.outputPath) + (r.reason ? ' - ' + r.reason : '');
                }
                const dims = r.width
                    ? r.width + '&times;' + r.height + ' &rarr; <b>' + (r.newWidth || '?') + '&times;' + (r.newHeight || '?') + '</b>'
                    : '-';
                return (
                    '<tr><td class="name" title="' + escapeHtml(r.path) + '">' + escapeHtml(r.name) + '</td>' +
                    '<td class="num">' + dims + '</td>' +
                    '<td class="num">' + (r.bytesIn != null ? formatBytes(r.bytesIn) : '-') + '</td>' +
                    '<td class="' + cls + '">' + escapeHtml(status) + '</td></tr>'
                );
            })
            .join('');
        let head = done ? '<h3>Result</h3>' : '<h3>Preview (nothing written yet)</h3>';
        let foot = '';
        if (done) {
            const saving = plan.bytesIn ? Math.round((1 - plan.bytesOut / plan.bytesIn) * 100) : 0;
            foot =
                '<div class="hint" style="margin-top:6px">Total: ' + formatBytes(plan.bytesIn) + ' &rarr; ' + formatBytes(plan.bytesOut) +
                ' <span class="' + (saving > 0 ? 'delta-good' : 'delta-bad') + '">(' + (saving >= 0 ? '-' : '+') + Math.abs(saving) + '%)</span>' +
                (plan.backupRoot ? '<br>Backup: ' + escapeHtml(plan.backupRoot) : '') +
                '</div>';
        } else if (plan.engineForOthers === 'none') {
            foot = '<div class="hint" style="margin-top:6px">PNG uses the built-in resizer. JPG/WebP/BMP need ffmpeg.exe (not found).</div>';
        }
        this.$.result.innerHTML = head + '<table><tr><th>File</th><th class="num">Size</th><th class="num">Bytes</th><th>Status</th></tr>' + rows + '</table>' + foot;
        this.$.result.classList.remove('hidden');
    },

    appendLog(lines) {
        if (!lines || !lines.length) {
            return;
        }
        this.$.log.textContent = lines.join('\n');
        this.$.logWrap.classList.remove('hidden');
        this.$.log.scrollTop = this.$.log.scrollHeight;
    },

    startPolling() {
        const self = this;
        clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            const status = await Editor.Message.request(PKG, 'progress-status').catch(() => null);
            if (!status) {
                return;
            }
            self.$.progress.value = status.percent / 100;
            self.$.progressText.textContent = status.message || '';
            self.appendLog(status.log);
            if (!status.running) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }, 200);
    },

    async onAddSelected() {
        const res = await Editor.Message.request(PKG, 'collect-selected').catch((e) => ({ ok: false, error: e.message }));
        if (!res || !res.ok) {
            this.showIssues([{ level: 'warning', message: (res && res.error) || 'Could not read the selection.' }]);
            return;
        }
        this.addFiles(res.files, res.errors);
    },

    async onBrowse() {
        const res = await Editor.Message.request(PKG, 'browse-files').catch(() => null);
        if (!res || !res.ok) {
            return;
        }
        this.addFiles(res.files, res.errors);
    },

    async onBrowseFolder() {
        const res = await Editor.Message.request(PKG, 'browse-folder', this.$.folder.value.trim()).catch(() => null);
        if (!res || !res.ok) {
            return;
        }
        this.$.folder.value = res.url || res.path;
    },

    async onDrop(event) {
        event.preventDefault();
        this.$.drop.classList.remove('hover');
        const items = [];
        const dt = event.dataTransfer;
        if (dt) {
            for (const key of ['value', 'uuid', 'text/plain']) {
                let v = '';
                try {
                    v = dt.getData(key);
                } catch (e) {
                    v = '';
                }
                if (v) {
                    try {
                        const parsed = JSON.parse(v);
                        if (Array.isArray(parsed)) {
                            parsed.forEach((p) => items.push(typeof p === 'string' ? p : p && (p.uuid || p.value || p.url || p.path)));
                        } else if (parsed && typeof parsed === 'object') {
                            items.push(parsed.uuid || parsed.value || parsed.url || parsed.path);
                        } else {
                            items.push(String(parsed));
                        }
                    } catch (e) {
                        v.split(/[\n,]/).forEach((s) => items.push(s.trim()));
                    }
                    break;
                }
            }
            if (dt.files && dt.files.length) {
                for (const f of dt.files) {
                    if (f.path) {
                        items.push(f.path);
                    }
                }
            }
        }
        const detail = event.detail;
        if (detail) {
            if (Array.isArray(detail)) {
                detail.forEach((d) => items.push(typeof d === 'string' ? d : d && (d.uuid || d.value)));
            } else if (detail.uuid || detail.value) {
                items.push(detail.uuid || detail.value);
            }
        }
        const clean = items.filter(Boolean);
        if (!clean.length) {
            // Fall back to whatever is selected in the Assets panel (the dragged items usually are).
            return this.onAddSelected();
        }
        const res = await Editor.Message.request(PKG, 'resolve-inputs', clean).catch(() => null);
        if (!res || !res.ok) {
            return this.onAddSelected();
        }
        this.addFiles(res.files, res.errors);
    },

    async onPreview() {
        if (!files.length) {
            this.showIssues([{ level: 'warning', message: 'Add at least one image first.' }]);
            return;
        }
        const options = this.collect();
        savePrefs(options);
        this.setBusy(true);
        this.$.progressText.textContent = 'Analyzing...';
        const res = await Editor.Message.request(PKG, 'analyze', options).catch((e) => ({ ok: false, error: e.message }));
        this.setBusy(false);
        if (!res || !res.ok) {
            this.showIssues([{ level: 'error', message: (res && res.error) || 'Analyze failed.' }]);
            return;
        }
        this.showIssues([]);
        this.renderPlan(res.plan, false);
    },

    async onResize() {
        if (!files.length) {
            this.showIssues([{ level: 'warning', message: 'Add at least one image first.' }]);
            return;
        }
        const options = this.collect();
        savePrefs(options);
        this.setBusy(true);
        this.$.log.textContent = '';
        this.$.progress.value = 0;
        this.startPolling();
        const res = await Editor.Message.request(PKG, 'run', options).catch((e) => ({ ok: false, error: e.message }));
        clearInterval(pollTimer);
        pollTimer = null;
        this.setBusy(false);
        if (!res || !res.ok) {
            this.appendLog((res && res.log) || []);
            this.showIssues([{ level: 'error', message: (res && res.error) || 'Resize failed.' }]);
            return;
        }
        const result = res.result;
        lastBackupRoot = result.backupRoot || '';
        this.$.revealBackup.disabled = !lastBackupRoot;
        this.$.progress.value = 1;
        this.$.progressText.textContent = result.cancelled ? 'Cancelled.' : 'Done.';
        this.appendLog(result.log);
        this.renderPlan(result, true);
        const failed = result.rows.filter((r) => !r.ok);
        this.showIssues(failed.map((r) => ({ level: 'error', message: r.name + ': ' + r.error })));

        // Refresh the file list with the new sizes when files were overwritten.
        if (options.output === 'inplace') {
            const paths = files.map((f) => f.path);
            const fresh = await Editor.Message.request(PKG, 'resolve-inputs', paths).catch(() => null);
            if (fresh && fresh.ok) {
                files = fresh.files;
                this.renderFiles();
            }
        }
    },

    async onCancel() {
        await Editor.Message.request(PKG, 'cancel').catch(() => null);
        this.$.progressText.textContent = 'Cancelling...';
    },
};

exports.ready = function () {
    const prefs = loadPrefs();
    const setIf = (el, key, fallback) => {
        if (prefs[key] !== undefined && prefs[key] !== null && prefs[key] !== '') {
            el.value = prefs[key];
        } else if (fallback !== undefined) {
            el.value = fallback;
        }
    };
    setIf(this.$.mode, 'mode', 'percent');
    setIf(this.$.percent, 'percent', 50);
    setIf(this.$.boxWidth, 'boxWidth', 600);
    setIf(this.$.boxHeight, 'boxHeight', 600);
    setIf(this.$.target, 'target', 600);
    setIf(this.$.allowUpscale, 'allowUpscale', false);
    setIf(this.$.multipleOf, 'multipleOf', '1');
    setIf(this.$.filter, 'filter', 'lanczos3');
    setIf(this.$.output, 'output', 'inplace');
    setIf(this.$.suffix, 'suffix', '_{w}x{h}');
    setIf(this.$.folder, 'folderUrl', '');
    setIf(this.$.format, 'format', 'keep');
    setIf(this.$.quality, 'quality', 85);
    setIf(this.$.backup, 'backup', true);
    setIf(this.$.refresh, 'refresh', true);
    this.updateVisibility();

    this.$.addSelected.addEventListener('confirm', this.onAddSelected.bind(this));
    this.$.browse.addEventListener('confirm', this.onBrowse.bind(this));
    this.$.browseFolder.addEventListener('confirm', this.onBrowseFolder.bind(this));
    this.$.clear.addEventListener('confirm', () => {
        files = [];
        this.renderFiles();
        this.$.result.classList.add('hidden');
        this.showIssues([]);
    });
    this.$.preview.addEventListener('confirm', this.onPreview.bind(this));
    this.$.resize.addEventListener('confirm', this.onResize.bind(this));
    this.$.cancelBtn.addEventListener('confirm', this.onCancel.bind(this));
    this.$.revealBackup.addEventListener('confirm', () => {
        if (lastBackupRoot) {
            Editor.Message.send(PKG, 'reveal', lastBackupRoot);
        }
    });
    this.$.mode.addEventListener('change', this.updateVisibility.bind(this));
    this.$.output.addEventListener('change', this.updateVisibility.bind(this));
    this.$.presets.querySelectorAll('ui-button').forEach((btn) => {
        btn.addEventListener('confirm', () => {
            this.$.percent.value = Number(btn.getAttribute('data-p'));
        });
    });

    const drop = this.$.drop;
    drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('hover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
    drop.addEventListener('drop', this.onDrop.bind(this));
};

exports.close = function () {
    clearInterval(pollTimer);
    pollTimer = null;
};
