#!/usr/bin/env node
'use strict';
/**
 * Milestone 1 prototype: the whole tool without the editor.
 *
 *   node cli.js --atlas assets/spine/hero/hero.atlas --scale 0.5
 *   node cli.js --atlas hero.atlas --scale 0.25 --out out/hero_25 --filter mitchell
 *   node cli.js --atlas hero.atlas --scale 0.5 --analyze      (dry run, writes nothing)
 *
 * No Node on PATH? Cocos Creator ships one:
 *   set ELECTRON_RUN_AS_NODE=1
 *   "C:\ProgramData\cocos\editors\Creator\3.7.4\CocosCreator.exe" cli.js --atlas ... --scale 0.5
 */

const path = require('path');
const { generate, analyzeOnly } = require('./src/core/generator');
const { formatBytes } = require('./src/core/report');
const { RESIZE_FILTERS } = require('./src/shared/types');

function parseArgs(argv) {
    const args = { scale: 0.5, filter: 'lanczos3', mode: 'A' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        switch (a) {
            case '--atlas': args.atlasPath = path.resolve(next()); break;
            case '--out': args.outputDir = path.resolve(next()); break;
            case '--scale': args.scale = Number(next()); break;
            case '--filter': args.filter = String(next()).toLowerCase(); break;
            case '--mode': args.mode = String(next()).toUpperCase(); break;
            case '--analyze': args.analyze = true; break;
            case '--overwrite': args.overwrite = true; break;
            case '--backup': args.backup = true; break;
            case '--mipmaps': args.mipmaps = true; break;
            case '-h':
            case '--help': args.help = true; break;
            default:
                if (!args.atlasPath && a.toLowerCase().endsWith('.atlas')) {
                    args.atlasPath = path.resolve(a);
                }
        }
    }
    if (args.scale > 1) {
        args.scale = args.scale / 100; // allow --scale 50
    }
    if (!args.outputDir && args.atlasPath) {
        const base = path.basename(args.atlasPath, path.extname(args.atlasPath));
        args.outputDir = path.join(path.dirname(args.atlasPath), '..', base + '_scaled_' + Math.round(args.scale * 100));
        args.outputDir = path.resolve(args.outputDir);
    }
    return args;
}

function printIssues(issues) {
    if (!issues.length) {
        return;
    }
    console.log('');
    for (const issue of issues) {
        const tag = issue.level === 'error' ? 'ERROR  ' : issue.level === 'warning' ? 'WARN   ' : 'INFO   ';
        console.log(tag + issue.message);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.atlasPath) {
        console.log('Usage: node cli.js --atlas <file.atlas> [--scale 0.5] [--out <dir>] [--filter ' + RESIZE_FILTERS.join('|') + ']');
        console.log('       [--analyze] [--overwrite] [--backup] [--mipmaps] [--mode A|B]');
        process.exit(args.help ? 0 : 1);
    }

    if (args.analyze) {
        const info = analyzeOnly(args);
        console.log('Atlas   : ' + args.atlasPath);
        console.log('Format  : ' + info.format + (info.pma ? ' (premultiplied alpha)' : ''));
        console.log('Pages   : ' + info.pages.length);
        info.pages.forEach((p) => {
            console.log(
                '  ' + p.name + '  ' + p.width + 'x' + p.height + ' -> ' + p.newWidth + 'x' + p.newHeight +
                '  (' + p.regionCount + ' regions, ' + formatBytes(p.bytes) + ')'
            );
        });
        console.log('Skeleton: ' + (info.skeletons.map((s) => s.name + (s.version ? ' v' + s.version : '')).join(', ') || 'none'));
        console.log('Regions : ' + info.stats.regionCount + ' (' + info.stats.rotatedCount + ' rotated, ' + info.stats.trimmedCount + ' trimmed)');
        if (info.stats.smallestRegion) {
            console.log('Smallest: ' + info.stats.smallestRegion.name + ' -> ' + info.stats.smallestRegion.width + 'x' + info.stats.smallestRegion.height + ' px');
        }
        console.log('Disk    : ' + formatBytes(info.estimate.diskBytes) + ' -> ~' + formatBytes(info.estimate.diskBytesEstimate));
        console.log('VRAM    : ' + formatBytes(info.estimate.vramBytes) + ' -> ' + formatBytes(info.estimate.newVramBytes));
        printIssues(info.issues);
        console.log('\n' + (info.canGenerate ? 'OK - safe to generate.' : 'BLOCKED - fix the errors above.'));
        return;
    }

    const result = await generate(args, (p) => console.log('[' + String(p.percent).padStart(3) + '%] ' + p.message));
    printIssues(result.issues);
    console.log('');
    console.log('Output  : ' + result.outputDir);
    console.log('Disk    : ' + formatBytes(result.bytesIn) + ' -> ' + formatBytes(result.bytesOut));
    console.log('VRAM    : ' + formatBytes(result.estimate.vramBytes) + ' -> ' + formatBytes(result.estimate.newVramBytes));
}

main().catch((e) => {
    console.error('\n' + (e.cancelled ? 'Cancelled.' : 'Failed: ' + e.message));
    process.exit(1);
});
