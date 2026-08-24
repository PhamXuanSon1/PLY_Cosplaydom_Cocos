'use strict';

const fs = require('fs');
const path = require('path');
const { formatBytes } = require('../core/report');

const PKG = 'spine-texture-optimizer';
const STATIC = path.join(__dirname, '..', '..', 'static');

exports.template = fs.readFileSync(path.join(STATIC, 'template', 'default.html'), 'utf8');
exports.style = fs.readFileSync(path.join(STATIC, 'style', 'default.css'), 'utf8');

exports.$ = {
    atlas: '#atlas',
    browse: '#browse',
    scale: '#scale',
    filter: '#filter',
    output: '#output',
    mode: '#mode',
    backup: '#backup',
    overwrite: '#overwrite',
    refresh: '#refresh',
    mipmaps: '#mipmaps',
    analyze: '#analyze',
    generate: '#generate',
    cancelBtn: '#cancelBtn',
    reveal: '#reveal',
    progressWrap: '#progressWrap',
    progress: '#progress',
    progressText: '#progressText',
    summary: '#summary',
    issues: '#issues',
    logWrap: '#logWrap',
    log: '#log',
};

let lastOutputPath = '';
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
        /* preferences are a convenience, never a hard failure */
    }
}

exports.methods = {
    collect() {
        return {
            atlasUrl: this.$.atlas.value.trim(),
            outputUrl: this.$.output.value.trim(),
            scale: Number(this.$.scale.value),
            filter: this.$.filter.value,
            mode: this.$.mode.value,
            backup: this.$.backup.value,
            overwrite: this.$.overwrite.value,
            refresh: this.$.refresh.value,
            mipmaps: this.$.mipmaps.value,
        };
    },

    suggestOutput() {
        const atlas = this.$.atlas.value.trim();
        if (!atlas || this.$.output.value.trim()) {
            return;
        }
        const base = path.basename(atlas, path.extname(atlas));
        const percent = Math.round(Number(this.$.scale.value) * 100);
        this.$.output.value = 'db://assets/spine-generated/' + base + '_' + percent;
    },

    setBusy(busy) {
        this.$.analyze.disabled = busy;
        this.$.generate.disabled = busy;
        this.$.cancelBtn.disabled = !busy;
        this.$.progressWrap.classList.toggle('hidden', !busy);
    },

    showIssues(issues) {
        if (!issues || !issues.length) {
            this.$.issues.classList.add('hidden');
            this.$.issues.innerHTML = '';
            return;
        }
        const order = { error: 0, warning: 1, info: 2 };
        const sorted = issues.slice().sort((a, b) => order[a.level] - order[b.level]);
        const rows = sorted
            .map((i) => '<div class="issue"><span class="tag ' + i.level + '">' + i.level.toUpperCase() + '</span><span>' + escapeHtml(i.message) + '</span></div>')
            .join('');
        this.$.issues.innerHTML = '<h3>Warnings (' + issues.length + ')</h3>' + rows;
        this.$.issues.classList.remove('hidden');
    },

    showSummary(info, plan) {
        const est = info.estimate;
        const pageRows = info.pages
            .map(
                (p) =>
                    '<div>' + escapeHtml(p.name) + ': <b>' + p.width + '&times;' + p.height + '</b> &rarr; <b>' +
                    p.newWidth + '&times;' + p.newHeight + '</b> &nbsp;<span class="hint">' + p.regionCount + ' regions, ' + formatBytes(p.bytes) + '</span></div>'
            )
            .join('');
        const smallest = info.stats.smallestRegion
            ? escapeHtml(info.stats.smallestRegion.name) + ' &rarr; ' + info.stats.smallestRegion.width + '&times;' + info.stats.smallestRegion.height + ' px'
            : '-';
        const vramSaving = est.vramBytes ? Math.round((1 - est.newVramBytes / est.vramBytes) * 100) : 0;
        this.$.summary.innerHTML =
            '<h3>Estimated result</h3><table>' +
            '<tr><td class="k">Atlas format</td><td>' + escapeHtml(info.format) + (info.pma ? ' (premultiplied alpha)' : '') + '</td></tr>' +
            '<tr><td class="k">Texture pages</td><td>' + pageRows + '</td></tr>' +
            '<tr><td class="k">Skeleton</td><td>' + (info.skeletons.map((s) => escapeHtml(s.name) + (s.version ? ' <span class="hint">v' + escapeHtml(s.version) + '</span>' : '')).join(', ') || '<span class="hint">none found</span>') + '</td></tr>' +
            '<tr><td class="k">Regions</td><td>' + info.stats.regionCount + ' (' + info.stats.rotatedCount + ' rotated, ' + info.stats.trimmedCount + ' trimmed)</td></tr>' +
            '<tr><td class="k">Smallest region</td><td>' + smallest + '</td></tr>' +
            '<tr><td class="k">Disk</td><td>' + formatBytes(est.diskBytes) + ' &rarr; ~' + formatBytes(est.diskBytesEstimate) + '</td></tr>' +
            '<tr><td class="k">VRAM (RGBA8)</td><td>' + formatBytes(est.vramBytes) + ' &rarr; ' + formatBytes(est.newVramBytes) +
            ' <span class="' + (vramSaving > 0 ? 'delta-good' : 'delta-bad') + '">(' + (vramSaving > 0 ? '-' : '') + Math.abs(vramSaving) + '%)</span></td></tr>' +
            '<tr><td class="k">Output</td><td>' + escapeHtml(plan.outputDir || '-') + '</td></tr>' +
            '</table>';
        this.$.summary.classList.remove('hidden');
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
        }, 250);
    },

    async onAnalyze() {
        this.suggestOutput();
        this.setBusy(true);
        this.$.progressText.textContent = 'Analyzing...';
        const options = this.collect();
        savePrefs(options);
        const response = await Editor.Message.request(PKG, 'analyze', options);
        this.setBusy(false);
        if (!response || !response.ok) {
            this.showIssues([{ level: 'error', code: 'ANALYZE', message: (response && response.error) || 'Analyze failed.' }]);
            this.$.summary.classList.add('hidden');
            return;
        }
        this.showSummary(response.info, response.info.plan);
        this.showIssues(response.info.issues);
        this.$.generate.disabled = !response.info.canGenerate;
    },

    async onGenerate() {
        this.suggestOutput();
        const options = this.collect();
        savePrefs(options);
        this.setBusy(true);
        this.$.log.textContent = '';
        this.startPolling();
        const response = await Editor.Message.request(PKG, 'generate', options);
        clearInterval(pollTimer);
        pollTimer = null;
        this.setBusy(false);
        if (!response || !response.ok) {
            this.appendLog((response && response.log) || []);
            this.showIssues([
                {
                    level: response && response.cancelled ? 'warning' : 'error',
                    code: 'GENERATE',
                    message: (response && response.error) || 'Generate failed.',
                },
            ]);
            return;
        }
        const result = response.result;
        lastOutputPath = result.outputDir;
        this.$.reveal.disabled = false;
        this.$.progress.value = 1;
        this.$.progressText.textContent = 'Done.';
        this.appendLog(
            result.log.concat([
                '',
                'Output    : ' + result.outputDir + (result.outputUrl ? '  (' + result.outputUrl + ')' : ''),
                'Backup    : ' + (result.backupDir || 'none'),
                'Disk      : ' + formatBytes(result.bytesIn) + ' -> ' + formatBytes(result.bytesOut),
                'VRAM      : ' + formatBytes(result.estimate.vramBytes) + ' -> ' + formatBytes(result.estimate.newVramBytes),
                'Skeletons : ' + (result.skeletons.map((s) => s.name).join(', ') || 'none') + ' (copied unmodified)',
            ])
        );
        this.showIssues(result.issues);
    },

    async onCancel() {
        await Editor.Message.request(PKG, 'cancel').catch(() => null);
        this.$.progressText.textContent = 'Cancelling...';
    },

    async onBrowse() {
        const response = await Editor.Message.request(PKG, 'browse-atlas', this.$.atlas.value.trim()).catch(() => null);
        if (!response || !response.ok) {
            return;
        }
        this.$.atlas.value = response.url || response.path;
        this.$.output.value = '';
        this.suggestOutput();
    },
};

exports.ready = function () {
    const prefs = loadPrefs();
    if (prefs.atlasUrl) {
        this.$.atlas.value = prefs.atlasUrl;
    }
    if (prefs.scale) {
        this.$.scale.value = String(prefs.scale);
    }
    if (prefs.filter) {
        this.$.filter.value = prefs.filter;
    }
    if (prefs.mode) {
        this.$.mode.value = prefs.mode;
    }
    if (typeof prefs.mipmaps === 'boolean') {
        this.$.mipmaps.value = prefs.mipmaps;
    }

    this.$.browse.addEventListener('confirm', this.onBrowse.bind(this));
    this.$.analyze.addEventListener('confirm', this.onAnalyze.bind(this));
    this.$.generate.addEventListener('confirm', this.onGenerate.bind(this));
    this.$.cancelBtn.addEventListener('confirm', this.onCancel.bind(this));
    this.$.reveal.addEventListener('confirm', () => {
        if (lastOutputPath) {
            Editor.Message.send(PKG, 'reveal', lastOutputPath);
        }
    });
    this.$.scale.addEventListener('change', () => {
        this.$.output.value = '';
        this.suggestOutput();
    });
    this.$.atlas.addEventListener('change', () => {
        this.$.output.value = '';
        this.suggestOutput();
    });
};

exports.close = function () {
    clearInterval(pollTimer);
    pollTimer = null;
};
