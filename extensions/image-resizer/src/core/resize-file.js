'use strict';
/**
 * Resize one image file on disk.
 *
 * Engines, in order of preference:
 *   1. builtin  - PNG -> PNG, dependency-free (png-codec + resample). Best
 *                 quality for sprites with transparency.
 *   2. ffmpeg   - JPG / WebP / BMP in or out. Looks for ffmpeg.exe next to this
 *                 extension, in ../playable-size-inspector/tools/ffmpeg, or on PATH.
 *   3. powershell (System.Drawing) - Windows fallback for JPG / BMP / PNG when
 *                 ffmpeg is missing.
 *
 * Output is written to a temp file first and then moved over the destination,
 * so an in-place overwrite never leaves a half-written image behind.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { decodePng, encodePng } = require('./png-codec');
const { resizeImageData } = require('./resample');
const { mkdirp } = require('./fsx');

const FFMPEG_CANDIDATES = [
    path.join(__dirname, '..', '..', 'tools', 'ffmpeg', 'ffmpeg.exe'),
    path.join(__dirname, '..', '..', '..', 'playable-size-inspector', 'tools', 'ffmpeg', 'ffmpeg.exe'),
];

let ffmpegCache;

function findFfmpeg() {
    if (ffmpegCache !== undefined) {
        return ffmpegCache;
    }
    ffmpegCache = null;
    for (const candidate of FFMPEG_CANDIDATES) {
        if (fs.existsSync(candidate)) {
            ffmpegCache = candidate;
            return ffmpegCache;
        }
    }
    const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const dirs = String(process.env.PATH || '').split(path.delimiter);
    for (const dir of dirs) {
        if (dir && fs.existsSync(path.join(dir, exe))) {
            ffmpegCache = path.join(dir, exe);
            return ffmpegCache;
        }
    }
    return ffmpegCache;
}

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error((stderr || err.message || '').trim() || 'process failed'));
                return;
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

function extOf(file) {
    return path.extname(file).toLowerCase();
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{newWidth:number,newHeight:number,filter?:string,quality?:number}} options
 * @returns {Promise<{engine:string,bytesIn:number,bytesOut:number,width:number,height:number}>}
 */
async function resizeFile(inputPath, outputPath, options) {
    const inExt = extOf(inputPath);
    const outExt = extOf(outputPath);
    const newWidth = Math.max(1, Math.round(options.newWidth));
    const newHeight = Math.max(1, Math.round(options.newHeight));
    const quality = clampInt(options.quality, 1, 100, 85);
    const filter = options.filter || 'lanczos3';
    const bytesIn = fs.statSync(inputPath).size;

    mkdirp(path.dirname(outputPath));
    const tmp = path.join(path.dirname(outputPath), '.' + path.basename(outputPath) + '.resize-tmp' + outExt);

    let engine;
    let size;
    try {
        if (inExt === '.png' && outExt === '.png') {
            engine = 'builtin';
            size = resizePngBuiltin(inputPath, tmp, newWidth, newHeight, filter);
        } else {
            const ffmpeg = findFfmpeg();
            if (ffmpeg) {
                engine = 'ffmpeg';
                await resizeWithFfmpeg(ffmpeg, inputPath, tmp, newWidth, newHeight, filter, quality);
            } else if (process.platform === 'win32' && ['.png', '.jpg', '.jpeg', '.bmp'].indexOf(inExt) !== -1 && ['.png', '.jpg', '.jpeg', '.bmp'].indexOf(outExt) !== -1) {
                engine = 'powershell';
                await resizeWithPowerShell(inputPath, tmp, newWidth, newHeight, quality);
            } else {
                throw new Error(
                    'Cannot resize ' + inExt + ' -> ' + outExt + ': ffmpeg.exe not found. Put it in extensions/image-resizer/tools/ffmpeg/ or install FFmpeg on PATH.'
                );
            }
            size = { width: newWidth, height: newHeight };
        }
        fs.renameSync(tmp, outputPath);
    } finally {
        if (fs.existsSync(tmp)) {
            try {
                fs.unlinkSync(tmp);
            } catch (e) {
                /* ignore */
            }
        }
    }

    return { engine, bytesIn, bytesOut: fs.statSync(outputPath).size, width: size.width, height: size.height };
}

function resizePngBuiltin(inputPath, outputPath, newWidth, newHeight, filter) {
    const image = decodePng(fs.readFileSync(inputPath));
    const resized = resizeImageData(image, newWidth, newHeight, { filter });
    fs.writeFileSync(outputPath, encodePng(resized));
    return { width: resized.width, height: resized.height };
}

const FFMPEG_FLAGS = { lanczos3: 'lanczos', mitchell: 'bicubic', triangle: 'bilinear', box: 'area', nearest: 'neighbor' };

async function resizeWithFfmpeg(ffmpeg, inputPath, outputPath, w, h, filter, quality) {
    const outExt = extOf(outputPath);
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-frames:v', '1'];
    args.push('-vf', 'scale=' + w + ':' + h + ':flags=' + (FFMPEG_FLAGS[filter] || 'lanczos'));
    if (outExt === '.jpg' || outExt === '.jpeg') {
        // ffmpeg mjpeg quality: 2 (best) .. 31 (worst)
        const q = Math.round(31 - (quality / 100) * 29);
        args.push('-q:v', String(Math.max(2, Math.min(31, q))), '-pix_fmt', 'yuvj420p');
    } else if (outExt === '.webp') {
        args.push('-c:v', 'libwebp', '-quality', String(quality));
    } else if (outExt === '.png') {
        args.push('-compression_level', '9');
    }
    args.push(outputPath);
    await run(ffmpeg, args);
}

async function resizeWithPowerShell(inputPath, outputPath, w, h, quality) {
    const script = path.join(__dirname, '..', '..', 'scripts', 'resize-image.ps1');
    const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-InputPath',
        inputPath,
        '-OutputPath',
        outputPath,
        '-Width',
        String(w),
        '-Height',
        String(h),
        '-Quality',
        String(quality),
    ];
    await run('powershell.exe', args);
}

function clampInt(v, min, max, dflt) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) {
        return dflt;
    }
    return Math.max(min, Math.min(max, n));
}

module.exports = { resizeFile, findFfmpeg };
