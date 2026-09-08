'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PACKAGE_NAME = 'playable-size-inspector';
const WORKSPACE_DIRECTORY = 'playable-size-inspector';

// Chan moi thao tac ghi ra ngoai build/<WORKSPACE_DIRECTORY>.
// Cac ban build cu (build/web-mobile, build/<ten khac>...) phai duoc giu nguyen:
// tool nay chi duoc phep TAO THEM file trong thu muc lam viec cua no.
function assertInsideWorkspace(targetPath, label) {
  const workspaceRoot = path.resolve(path.join(Editor.Project.path, 'build', WORKSPACE_DIRECTORY));
  const resolved = path.resolve(targetPath);
  if (!isSameResolvedPath(resolved, workspaceRoot) && !isPathInside(resolved, workspaceRoot)) {
    throw new Error(
      `${label} must stay inside build/${WORKSPACE_DIRECTORY} so existing builds are never overwritten. `
      + `Got: ${resolved}`,
    );
  }
  return resolved;
}

exports.methods = {
  openPanel() {
    Editor.Panel.open(PACKAGE_NAME);
  },

  async revealAsset(payload) {
    const uuid = String(payload && payload.uuid || '').trim();
    const url = String(payload && payload.url || '').trim();

    if (!uuid && !url) {
      return { ok: false, reason: 'missing-target' };
    }

    const targetUuid = uuid || await resolveUuidFromUrl(url);
    if (!targetUuid) {
      return { ok: false, reason: 'uuid-not-found' };
    }

    const selection = Editor.Selection;
    if (selection && typeof selection.select === 'function') {
      try {
        selection.select('asset', targetUuid);
      } catch (_error) {
        try {
          selection.select(targetUuid);
        } catch (_innerError) {
          // Fall through to other reveal methods.
        }
      }
    }

    try {
      await Editor.Message.request('assets', 'twinkle', targetUuid);
      return { ok: true, mode: 'assets.twinkle', uuid: targetUuid };
    } catch (_error) {
      // Some versions may not expose assets.twinkle.
    }

    try {
      await Editor.Message.request('asset-db', 'open-asset', targetUuid);
      return { ok: true, mode: 'asset-db.open-asset', uuid: targetUuid };
    } catch (_error) {
      // Some versions may not allow opening by uuid.
    }

    try {
      await Editor.Message.request('asset-db', 'open-asset', { uuid: targetUuid });
      return { ok: true, mode: 'asset-db.open-asset-object', uuid: targetUuid };
    } catch (_error) {
      // Last fallback below.
    }

    return { ok: true, mode: 'selection-only', uuid: targetUuid };
  },

  async optimizeExportAll(payload) {
    const sourceRoot = String(payload && payload.sourceRoot || '').trim();
    const optimizedRoot = String(payload && payload.optimizedRoot || '').trim();
    const exportRoot = String(payload && payload.exportRoot || '').trim();
    const maxTextureSize = Number(payload && payload.maxTextureSize || 1024);
    const jpegQuality = Number(payload && payload.jpegQuality || 82);

    if (!sourceRoot || !optimizedRoot || !exportRoot) {
      throw new Error('Missing sourceRoot, optimizedRoot, or exportRoot.');
    }

    assertInsideWorkspace(optimizedRoot, 'Output Root');
    assertInsideWorkspace(exportRoot, 'Export Root');

    const defaultOriginalRoot = path.join(Editor.Project.path, 'build', 'web-mobile');
    const originalSourceRoot = isSameResolvedPath(sourceRoot, optimizedRoot)
      ? defaultOriginalRoot
      : sourceRoot;
    const hasOriginalSource = await pathExists(originalSourceRoot);
    const effectiveSourceRoot = hasOriginalSource ? originalSourceRoot : sourceRoot;
    if (isSameResolvedPath(effectiveSourceRoot, optimizedRoot)) {
      throw new Error('Original build/web-mobile was not found. Build the web-mobile target before Optimize + Export All.');
    }
    const optimizedRootExists = await pathExists(optimizedRoot);
    const optimizedCopyHasUnsafeResizes = optimizedRootExists
      && await hasUnsafePngDimensionChanges(effectiveSourceRoot, optimizedRoot);
    const optimizedCopyHasChanges = optimizedRootExists
      && !optimizedCopyHasUnsafeResizes
      && !isSameResolvedPath(effectiveSourceRoot, optimizedRoot)
      && !await areBuildRootsEquivalent(effectiveSourceRoot, optimizedRoot);

    // Preserve per-asset edits. If the copy is still byte-for-byte equivalent,
    // run the bulk optimizer instead of silently exporting an unchanged build.
    const optimizeReport = optimizedCopyHasChanges
      ? await summarizeExistingOptimizedCopy(effectiveSourceRoot, optimizedRoot, {
          maxTextureSize,
          jpegQuality,
          skippedReason: 'preserved-existing-asset-optimizations',
        })
      : await runOptimizeScript({
          sourceRoot: effectiveSourceRoot,
          outputRoot: optimizedRoot,
          maxTextureSize,
          jpegQuality,
        });

    const optimizedReport = await runIsolatedAdapterExport({
      webMobileRoot: optimizedRoot,
      exportRoot,
    });

    return {
      optimizeReport,
      exportReport: {
        optimizedReport,
        optimizedAnalysis: optimizedReport.analysis || null,
      },
    };
  },

  async optimizeSelectedAsset(payload) {
    const sourceRoot = String(payload && payload.sourceRoot || '').trim();
    const outputRoot = String(payload && payload.outputRoot || '').trim();
    const relativePath = String(payload && payload.relativePath || '').trim();
    const assetKind = String(payload && payload.assetKind || '').trim();
    const maxTextureSize = Number(payload && payload.maxTextureSize || 1024);
    const jpegQuality = Number(payload && payload.jpegQuality || 82);
    const targetFormat = String(payload && payload.targetFormat || 'original').trim() || 'original';
    const audioBitrate = Number(payload && payload.audioBitrate || 96);
    const pngQuality = String(payload && payload.pngQuality || '65-85').trim() || '65-85';

    if (!sourceRoot || !outputRoot || !relativePath) {
      throw new Error('Missing sourceRoot, outputRoot, or relativePath.');
    }

    assertInsideWorkspace(outputRoot, 'Output Root');

    if (isSameResolvedPath(sourceRoot, outputRoot)) {
      throw new Error('Build Root and Output Root must be different so the original asset stays untouched.');
    }

    await ensureOutputBuildCopy({
      sourceRoot,
      outputRoot,
    });

    const resolvedSourceFile = resolveBuildFile(sourceRoot, relativePath);
    const resolvedDestinationFile = resolveBuildFile(outputRoot, relativePath);
    await fs.access(resolvedSourceFile);

    if (assetKind === 'audio') {
      return await runSafeAudioOptimizeToDestination({
        inputPath: resolvedSourceFile,
        outputPath: resolvedDestinationFile,
        audioBitrate,
      });
    }

    if (path.extname(resolvedDestinationFile).toLowerCase() === '.png') {
      return await runSafePngQuantToDestination({
        inputPath: resolvedSourceFile,
        outputPath: resolvedDestinationFile,
        pngQuality,
      });
    }

    const sourceExtension = path.extname(resolvedDestinationFile).toLowerCase();
    const desiredExtension = getTargetExtension(targetFormat, sourceExtension);

    if (desiredExtension !== sourceExtension) {
      throw new Error('Safe apply does not support changing the built file extension.');
    }

    if (resolvedSourceFile.toLowerCase() === resolvedDestinationFile.toLowerCase()) {
      const tempOutputPath = path.join(
        path.dirname(resolvedDestinationFile),
        `${path.basename(resolvedDestinationFile)}.opt-temp${path.extname(resolvedDestinationFile)}`
      );

      const report = await runSingleImageOptimize({
        inputPath: resolvedSourceFile,
        outputPath: tempOutputPath,
        maxTextureSize,
        jpegQuality,
        targetFormat,
        keepLargerOutput: false,
        allowResize: false,
      });

      await fs.rm(resolvedDestinationFile, { force: true });
      await renameWithRetry(tempOutputPath, resolvedDestinationFile);

      return {
        ...report,
        outputPath: resolvedDestinationFile,
      };
    }

    return await runSingleImageOptimize({
      inputPath: resolvedSourceFile,
      outputPath: resolvedDestinationFile,
      maxTextureSize,
      jpegQuality,
      targetFormat,
      keepLargerOutput: false,
      allowResize: false,
    });
  },

  async resetSelectedAsset(payload) {
    const sourceRoot = String(payload && payload.sourceRoot || '').trim();
    const outputRoot = String(payload && payload.outputRoot || '').trim();
    const relativePath = String(payload && payload.relativePath || '').trim();

    if (!sourceRoot || !outputRoot || !relativePath) {
      throw new Error('Missing sourceRoot, outputRoot, or relativePath.');
    }

    assertInsideWorkspace(outputRoot, 'Output Root');
    if (isSameResolvedPath(sourceRoot, outputRoot)) {
      throw new Error('Build Root and Output Root must be different so Reset cannot overwrite the original build.');
    }

    const sourceFile = resolveBuildFile(sourceRoot, relativePath);
    const outputFile = resolveBuildFile(outputRoot, relativePath);
    const sourceStat = await fs.stat(sourceFile);

    await ensureOutputBuildCopy({ sourceRoot, outputRoot });
    const beforeBytes = await fs.stat(outputFile).then((stat) => stat.size).catch(() => sourceStat.size);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.copyFile(sourceFile, outputFile);

    return {
      inputPath: sourceFile,
      outputPath: outputFile,
      beforeBytes,
      afterBytes: sourceStat.size,
      optimized: false,
      reset: true,
      skippedReason: 'reset-to-original',
    };
  },
};

async function runOptimizeScript({ sourceRoot, outputRoot, maxTextureSize, jpegQuality }) {
  const scriptPath = path.join(__dirname, 'scripts', 'optimize-build-copy.ps1');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-SourceRoot', sourceRoot,
    '-OutputRoot', outputRoot,
    '-MaxTextureSize', String(Math.round(maxTextureSize)),
    '-JpegQuality', String(Math.round(jpegQuality)),
  ];

  return await new Promise((resolve, reject) => {
    execFile('powershell.exe', args, {
      cwd: Editor.Project.path,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr && stderr.trim() ? stderr.trim() : error.message;
        reject(new Error(message));
        return;
      }

      const text = String(stdout || '').trim();
      if (!text) {
        reject(new Error('Optimization script returned no output.'));
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch (parseError) {
        reject(new Error(`Failed to parse optimizer output: ${parseError.message}\n${text}`));
      }
    });
  });
}

async function summarizeBuildRoot(rootPath, options = {}) {
  const resolvedRoot = path.resolve(rootPath);
  const files = await collectAllFiles(resolvedRoot);
  const imageFiles = files.filter((file) => ['.png', '.jpg', '.jpeg', '.bmp'].includes(path.extname(file.fullPath).toLowerCase()));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return {
    sourceRoot: resolvedRoot,
    outputRoot: resolvedRoot,
    maxTextureSize: Number(options.maxTextureSize || 0),
    jpegQuality: Number(options.jpegQuality || 0),
    totalFiles: files.length,
    imageFiles: imageFiles.length,
    optimizedFiles: 0,
    totalBeforeBytes: totalBytes,
    totalAfterBytes: totalBytes,
    optimizedBeforeBytes: 0,
    optimizedAfterBytes: 0,
    files: [],
    skippedReason: String(options.skippedReason || 'already-optimized-root'),
  };
}

async function summarizeExistingOptimizedCopy(sourceRoot, outputRoot, options = {}) {
  const [sourceFiles, outputFiles] = await Promise.all([
    collectAllFiles(sourceRoot),
    collectAllFiles(outputRoot),
  ]);
  const sourceByPath = new Map(sourceFiles.map((file) => [
    path.relative(sourceRoot, file.fullPath).replace(/\\/g, '/').toLowerCase(),
    file,
  ]));
  const changedFiles = [];

  for (const outputFile of outputFiles) {
    const relativePath = path.relative(outputRoot, outputFile.fullPath).replace(/\\/g, '/');
    const sourceFile = sourceByPath.get(relativePath.toLowerCase());
    if (!sourceFile || sourceFile.size === outputFile.size) {
      continue;
    }
    changedFiles.push({
      relativePath,
      beforeBytes: sourceFile.size,
      afterBytes: outputFile.size,
      optimized: outputFile.size < sourceFile.size,
    });
  }

  const reducedFiles = changedFiles.filter((file) => file.optimized);
  const totalBeforeBytes = sourceFiles.reduce((sum, file) => sum + file.size, 0);
  const totalAfterBytes = outputFiles.reduce((sum, file) => sum + file.size, 0);

  return {
    sourceRoot: path.resolve(sourceRoot),
    outputRoot: path.resolve(outputRoot),
    maxTextureSize: Number(options.maxTextureSize || 0),
    jpegQuality: Number(options.jpegQuality || 0),
    totalFiles: outputFiles.length,
    imageFiles: outputFiles.filter((file) => ['.png', '.jpg', '.jpeg', '.bmp'].includes(path.extname(file.fullPath).toLowerCase())).length,
    optimizedFiles: reducedFiles.length,
    totalBeforeBytes,
    totalAfterBytes,
    optimizedBeforeBytes: reducedFiles.reduce((sum, file) => sum + file.beforeBytes, 0),
    optimizedAfterBytes: reducedFiles.reduce((sum, file) => sum + file.afterBytes, 0),
    files: reducedFiles.sort((left, right) => (right.beforeBytes - right.afterBytes) - (left.beforeBytes - left.afterBytes)).slice(0, 100),
    skippedReason: String(options.skippedReason || 'preserved-existing-copy'),
  };
}

async function collectAllFiles(root) {
  const files = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.stat(fullPath);
      files.push({
        fullPath,
        size: stat.size,
      });
    }
  }

  await walk(root);
  return files;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function runSingleImageOptimize({ inputPath, outputPath, maxTextureSize, jpegQuality, targetFormat = 'original', keepLargerOutput = false, allowResize = false }) {
  const scriptPath = path.join(__dirname, 'scripts', 'optimize-image-file.ps1');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-InputPath', inputPath,
    '-OutputPath', outputPath,
    '-MaxTextureSize', String(Math.round(maxTextureSize)),
    '-JpegQuality', String(Math.round(jpegQuality)),
    '-TargetFormat', targetFormat,
    '-KeepLargerOutputFlag', keepLargerOutput ? '1' : '0',
    '-AllowResizeFlag', allowResize ? '1' : '0',
  ];

  return await new Promise((resolve, reject) => {
    execFile('powershell.exe', args, {
      cwd: Editor.Project.path,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr && stderr.trim() ? stderr.trim() : error.message;
        reject(new Error(message));
        return;
      }

      const text = String(stdout || '').trim();
      if (!text) {
        reject(new Error('Image optimizer returned no output.'));
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch (parseError) {
        reject(new Error(`Failed to parse image optimizer output: ${parseError.message}\n${text}`));
      }
    });
  });
}

async function runSafeAudioOptimizeToDestination({ inputPath, outputPath, audioBitrate }) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  if (resolvedInput.toLowerCase() === resolvedOutput.toLowerCase()) {
    const tempOutputPath = path.join(
      path.dirname(resolvedOutput),
      `${path.basename(resolvedOutput)}.audio-opt-temp${path.extname(resolvedOutput)}`
    );

    const report = await runSingleAudioOptimize({
      inputPath: resolvedInput,
      outputPath: tempOutputPath,
      audioBitrate,
    });

    await fs.rm(resolvedOutput, { force: true });
    await renameWithRetry(tempOutputPath, resolvedOutput);
    return {
      ...report,
      outputPath: resolvedOutput,
    };
  }

  return await runSingleAudioOptimize({
    inputPath: resolvedInput,
    outputPath: resolvedOutput,
    audioBitrate,
  });
}

async function runSafePngQuantToDestination({ inputPath, outputPath, pngQuality }) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  if (resolvedInput.toLowerCase() === resolvedOutput.toLowerCase()) {
    const tempOutputPath = path.join(
      path.dirname(resolvedOutput),
      `${path.basename(resolvedOutput)}.pngquant-temp.png`,
    );
    try {
      const report = await runPngQuantOptimize({
        inputPath: resolvedInput,
        outputPath: tempOutputPath,
        pngQuality,
      });
      await fs.rm(resolvedOutput, { force: true });
      await renameWithRetry(tempOutputPath, resolvedOutput);
      return { ...report, outputPath: resolvedOutput };
    } finally {
      await fs.rm(tempOutputPath, { force: true }).catch(() => {});
    }
  }

  return await runPngQuantOptimize({
    inputPath: resolvedInput,
    outputPath: resolvedOutput,
    pngQuality,
  });
}

async function runPngQuantOptimize({ inputPath, outputPath, pngQuality }) {
  const pngquantPath = path.join(__dirname, 'tools', 'pngquant', 'pngquant.exe');
  const quality = normalizePngQuality(pngQuality);
  const beforeBytes = (await fs.stat(inputPath)).size;
  const beforeDimensions = await readPngDimensions(inputPath);

  await fs.access(pngquantPath).catch(() => {
    throw new Error('pngquant.exe was not found in tools/pngquant.');
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });

  let skippedReason = '';
  await new Promise((resolve, reject) => {
    execFile(pngquantPath, [
      '--quality', quality,
      '--speed', '3',
      // Dithering can make already-indexed PNGs larger and defeats size optimization.
      '--nofs',
      '--strip',
      '--skip-if-larger',
      '--force',
      '--output', outputPath,
      inputPath,
    ], {
      cwd: Editor.Project.path,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      if (Number(error.code) === 98 || Number(error.code) === 99) {
        skippedReason = Number(error.code) === 99 ? 'quality-not-met' : 'no-gain';
        resolve();
        return;
      }
      reject(new Error(stderr && stderr.trim() ? stderr.trim() : error.message));
    });
  });

  if (!await pathExists(outputPath)) {
    await fs.copyFile(inputPath, outputPath);
  }

  let afterBytes = (await fs.stat(outputPath)).size;
  const afterDimensions = await readPngDimensions(outputPath);
  if (
    !beforeDimensions
    || !afterDimensions
    || beforeDimensions.width !== afterDimensions.width
    || beforeDimensions.height !== afterDimensions.height
  ) {
    await fs.copyFile(inputPath, outputPath);
    throw new Error('PNG optimization was rejected because texture dimensions changed.');
  }

  const optimized = afterBytes < beforeBytes;
  if (!optimized) {
    await fs.copyFile(inputPath, outputPath);
    afterBytes = beforeBytes;
  }
  return {
    inputPath: path.resolve(inputPath),
    outputPath: path.resolve(outputPath),
    extension: '.png',
    outputFormat: '.png',
    beforeBytes,
    afterBytes,
    originalWidth: beforeDimensions.width,
    originalHeight: beforeDimensions.height,
    outputWidth: afterDimensions.width,
    outputHeight: afterDimensions.height,
    hasAlpha: true,
    resized: false,
    optimized,
    pngQuality: quality,
    dithering: 'disabled',
    skippedReason: optimized ? '' : (skippedReason || 'no-gain'),
  };
}

function normalizePngQuality(value) {
  const quality = String(value || '65-85');
  return ['80-95', '65-85', '45-70'].includes(quality) ? quality : '65-85';
}

async function resolveAudioTool(toolName) {
  const localTool = path.join(__dirname, 'tools', 'ffmpeg', `${toolName}.exe`);
  try {
    await fs.access(localTool);
    return localTool;
  } catch (_error) {
    return toolName;
  }
}

async function runSingleAudioOptimize({ inputPath, outputPath, audioBitrate }) {
  const ffmpegPath = await resolveAudioTool('ffmpeg');
  const ffprobePath = await resolveAudioTool('ffprobe');
  const inputExtension = path.extname(inputPath).toLowerCase();
  const outputExtension = path.extname(outputPath).toLowerCase();

  if (!['.mp3', '.ogg'].includes(inputExtension) || !['.mp3', '.ogg'].includes(outputExtension)) {
    throw new Error('Safe audio optimize currently supports only .mp3 and .ogg files.');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const beforeInfo = await probeAudioFile(ffprobePath, inputPath);
  const beforeBytes = (await fs.stat(inputPath)).size;
  const codecArgs = getAudioCodecArgs(outputExtension, audioBitrate);

  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      ...codecArgs,
      outputPath,
    ], {
      cwd: Editor.Project.path,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, _stdout, stderr) => {
      if (error) {
        if (error.code === 'ENOENT') {
          reject(new Error('FFmpeg not found. Please place ffmpeg.exe and ffprobe.exe into extensions/playable-size-inspector/tools/ffmpeg/ or install FFmpeg in your PATH.'));
          return;
        }
        reject(new Error(stderr && stderr.trim() ? stderr.trim() : error.message));
        return;
      }
      resolve();
    });
  });

  const afterInfo = await probeAudioFile(ffprobePath, outputPath);
  const afterBytes = (await fs.stat(outputPath)).size;

  return {
    inputPath: path.resolve(inputPath),
    outputPath: path.resolve(outputPath),
    extension: inputExtension,
    outputFormat: outputExtension,
    beforeBytes,
    afterBytes,
    optimized: afterBytes < beforeBytes,
    requestedAudioBitrateKbps: Math.round(audioBitrate),
    originalBitrateKbps: beforeInfo.bitRateKbps,
    outputBitrateKbps: afterInfo.bitRateKbps,
    durationSeconds: afterInfo.durationSeconds || beforeInfo.durationSeconds || 0,
    channels: afterInfo.channels || beforeInfo.channels || 0,
    sampleRate: afterInfo.sampleRate || beforeInfo.sampleRate || 0,
    codecName: afterInfo.codecName || beforeInfo.codecName || '',
  };
}

async function probeAudioFile(ffprobePath, filePath) {
  return await new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ], {
      cwd: Editor.Project.path,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ENOENT') {
          resolve({
            bitRateKbps: 0,
            durationSeconds: 0,
            channels: 2,
            sampleRate: 44100,
            codecName: path.extname(filePath).replace('.', ''),
          });
          return;
        }
        reject(new Error(stderr && stderr.trim() ? stderr.trim() : error.message));
        return;
      }
      try {
        const payload = JSON.parse(stdout || '{}');
        const format = payload.format || {};
        const stream = Array.isArray(payload.streams) ? payload.streams[0] || {} : {};
        const bitRateKbps = Math.round(Number(format.bit_rate || stream.bit_rate || 0) / 1000);
        resolve({
          bitRateKbps: bitRateKbps > 0 ? bitRateKbps : 0,
          durationSeconds: Number(format.duration || stream.duration || 0),
          channels: Number(stream.channels || 0),
          sampleRate: Number(stream.sample_rate || 0),
          codecName: String(stream.codec_name || '').trim(),
        });
      } catch (_parseError) {
        resolve({
          bitRateKbps: 0,
          durationSeconds: 0,
          channels: 0,
          sampleRate: 0,
          codecName: '',
        });
      }
    });
  });
}

function getAudioCodecArgs(extension, audioBitrate) {
  const bitrate = `${Math.max(24, Math.min(320, Math.round(audioBitrate)))}k`;
  if (extension === '.mp3') {
    return ['-c:a', 'libmp3lame', '-b:a', bitrate];
  }
  if (extension === '.ogg') {
    return ['-c:a', 'libvorbis', '-b:a', bitrate];
  }
  throw new Error(`Unsupported audio extension: ${extension}`);
}

function getTargetExtension(targetFormat, sourceExtension) {
  switch (String(targetFormat || 'original').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return '.jpg';
    case 'png':
      return '.png';
    default:
      return sourceExtension;
  }
}

function roundNumber(value, digits) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isSameResolvedPath(leftPath, rightPath) {
  return path.resolve(leftPath).toLowerCase() === path.resolve(rightPath).toLowerCase();
}

function resolveBuildFile(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFile = path.resolve(resolvedRoot, String(relativePath).replace(/\//g, path.sep));
  if (!isPathInside(resolvedFile, resolvedRoot)) {
    throw new Error('Asset path must stay inside its build root.');
  }
  return resolvedFile;
}

function isPathInside(candidatePath, parentPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

async function ensureOutputBuildCopy({ sourceRoot, outputRoot }) {
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedOutput = path.resolve(outputRoot);

  try {
    const stat = await fs.stat(resolvedOutput);
    if (stat.isDirectory()) {
      return;
    }
  } catch (_error) {
    // Output copy not created yet.
  }

  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await copyDirectory(resolvedSource, resolvedOutput);
}

async function areBuildRootsEquivalent(leftRoot, rightRoot) {
  const [leftFiles, rightFiles] = await Promise.all([
    collectAllFiles(leftRoot),
    collectAllFiles(rightRoot),
  ]);

  if (leftFiles.length !== rightFiles.length) {
    return false;
  }

  const rightByPath = new Map(rightFiles.map((file) => [
    path.relative(rightRoot, file.fullPath).replace(/\\/g, '/').toLowerCase(),
    file,
  ]));

  for (const file of leftFiles) {
    const relativePath = path.relative(leftRoot, file.fullPath).replace(/\\/g, '/').toLowerCase();
    const rightFile = rightByPath.get(relativePath);
    if (!rightFile || rightFile.size !== file.size) {
      return false;
    }

    const [leftContent, rightContent] = await Promise.all([
      fs.readFile(file.fullPath),
      fs.readFile(rightFile.fullPath),
    ]);
    const leftHash = crypto.createHash('sha256').update(leftContent).digest('hex');
    const rightHash = crypto.createHash('sha256').update(rightContent).digest('hex');
    if (leftHash !== rightHash) {
      return false;
    }
  }

  return true;
}

async function hasUnsafePngDimensionChanges(sourceRoot, outputRoot) {
  const sourceFiles = await collectAllFiles(sourceRoot);

  for (const sourceFile of sourceFiles) {
    if (path.extname(sourceFile.fullPath).toLowerCase() !== '.png') {
      continue;
    }

    const relativePath = path.relative(sourceRoot, sourceFile.fullPath);
    const outputPath = path.join(outputRoot, relativePath);
    if (!await pathExists(outputPath)) {
      continue;
    }

    const [sourceDimensions, outputDimensions] = await Promise.all([
      readPngDimensions(sourceFile.fullPath),
      readPngDimensions(outputPath),
    ]);
    if (
      sourceDimensions
      && outputDimensions
      && (sourceDimensions.width !== outputDimensions.width || sourceDimensions.height !== outputDimensions.height)
    ) {
      return true;
    }
  }

  return false;
}

async function readPngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(24);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const isPng = bytesRead === 24
      && buffer.toString('ascii', 1, 4) === 'PNG'
      && buffer.toString('ascii', 12, 16) === 'IHDR';
    if (!isPng) {
      return null;
    }
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  } finally {
    await handle.close();
  }
}

async function runIsolatedAdapterExport({ webMobileRoot, exportRoot }) {
  const projectRoot = Editor.Project.path;
  const buildRoot = path.join(projectRoot, 'build');
  const playableRoot = path.join(buildRoot, WORKSPACE_DIRECTORY);
  const webMobileRootResolved = path.resolve(webMobileRoot);
  const exportRootResolved = path.resolve(exportRoot);
  const playableRootResolved = path.resolve(playableRoot);
  const buildWebMobileResolved = path.resolve(path.join(buildRoot, 'web-mobile'));

  if (
    !isPathInside(webMobileRootResolved, playableRootResolved)
    && !isSameResolvedPath(webMobileRootResolved, buildWebMobileResolved)
  ) {
    throw new Error(`Export source root must be either build/web-mobile or a folder inside build/${WORKSPACE_DIRECTORY}.`);
  }
  if (!isPathInside(exportRootResolved, playableRootResolved)) {
    throw new Error(`Export root must stay inside build/${WORKSPACE_DIRECTORY}.`);
  }
  if (!await pathExists(webMobileRootResolved)) {
    throw new Error(`Export source root does not exist: ${webMobileRootResolved}`);
  }

  // Packager duy nhat duoc phep chay: no nhan webMobileDir + outputPath ro rang,
  // nen KHONG can dung toi build/web-mobile hay bat ky ban build cu nao.
  // Moi thu duoc ghi moi ben trong build/<WORKSPACE_DIRECTORY>.
  const builderRoot = await findPlayableAdsBuilderRoot(projectRoot);
  if (!builderRoot) {
    throw new Error(
      'Playable Ads Builder was not found. Install the "playable-ads-builder" extension in this project '
      + 'before running Optimize + Export All.',
    );
  }

  await fs.mkdir(playableRoot, { recursive: true });
  await fs.mkdir(exportRootResolved, { recursive: true });

  const buildInfo = await resolveWebMobileBuildInfo(projectRoot);
  const exported = await runPlayableAdsBuilderExport({
    builderRoot,
    projectRoot,
    webMobileDir: webMobileRootResolved,
    outputPath: exportRootResolved,
    productName: buildInfo.name,
  });

  const analysis = await analyzeExportRoot(exportRootResolved);

  return {
    exportRoot: exportRootResolved,
    buildName: buildInfo.name,
    exportedEntries: exported,
    analysis,
  };
}

// Goi thang API dong goi cua playable-ads-builder.
// buildPlayableAds(webMobileDir, cocosVersion, options) chi doc tu webMobileDir
// va chi ghi vao options.outputPath -> khong dong cham build/web-mobile,
// khong xoa/di chuyen cac ban build cu trong build/.
async function runPlayableAdsBuilderExport({ builderRoot, projectRoot, webMobileDir, outputPath, productName }) {
  const playableBuildPath = path.join(builderRoot, 'dist', 'playable-build.js');
  if (!await pathExists(playableBuildPath)) {
    throw new Error(`playable-ads-builder is installed but dist/playable-build.js is missing: ${playableBuildPath}`);
  }

  const playableBuild = require(playableBuildPath);
  if (!playableBuild || typeof playableBuild.buildPlayableAds !== 'function') {
    throw new Error('The installed playable-ads-builder does not expose buildPlayableAds().');
  }

  const channelsModule = require(path.join(builderRoot, 'dist', 'channels.js'));
  const options = await readPlayableBuilderOptions(projectRoot);
  const channels = resolvePlayableBuilderChannels(channelsModule, options);

  if (channels.length === 0) {
    throw new Error(
      'No ad channel is selected for playable-ads-builder. Tick at least one channel in the Build panel '
      + '(or in settings/v2/packages/playable-ads-builder.json) and try again.',
    );
  }

  const cocosVersion = await readCocosEngineVersion(webMobileDir);
  const compressionQuality = typeof options.compressionQuality === 'number' ? options.compressionQuality : 80;
  const audioBitrate = typeof options.audioBitrate === 'number' ? options.audioBitrate : 64;

  const processed = await playableBuild.buildPlayableAds(
    webMobileDir,
    cocosVersion,
    {
      product: {
        name: productName,
        appleUrl: options.appleUrl || '',
        googleUrl: options.googleUrl || '',
      },
      channels,
      outputPath,
      compression: {
        type: options.compressionType || (channelsModule.CompressionType && channelsModule.CompressionType.Lossy) || 'lossy',
        quality: compressionQuality,
      },
      audio: {
        enabled: options.audioCompressionEnabled !== false,
        bitrate: audioBitrate,
      },
    },
    (stage, current, total) => {
      console.log(`[${PACKAGE_NAME}] playable-ads-builder [${stage}] ${current}/${total}`);
    },
  );

  return Array.isArray(processed) ? processed.map((file) => path.basename(String(file))) : [];
}

async function findPlayableAdsBuilderRoot(projectRoot) {
  const extensionRoots = new Set([
    path.join(projectRoot, 'extensions'),
    path.dirname(__dirname),
  ]);

  for (const extensionsRoot of extensionRoots) {
    const exactRoot = path.join(extensionsRoot, 'playable-ads-builder');
    if (await isPackageNamed(exactRoot, 'playable-ads-builder')) {
      return exactRoot;
    }

    const entries = await fs.readdir(extensionsRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidateRoot = path.join(extensionsRoot, entry.name);
      if (await isPackageNamed(candidateRoot, 'playable-ads-builder')) {
        return candidateRoot;
      }
    }
  }

  return null;
}

// Uu tien options cua build task moi nhat, sau do den profile (per-user),
// cuoi cung la settings (per-project, duoc commit).
async function readPlayableBuilderOptions(projectRoot) {
  const merged = {};

  const settings = await readJsonFile(
    path.join(projectRoot, 'settings', 'v2', 'packages', 'playable-ads-builder.json'),
  );
  const profile = await readJsonFile(
    path.join(projectRoot, 'profiles', 'v2', 'packages', 'playable-ads-builder.json'),
  );

  const builderProfile = await readJsonFile(
    path.join(projectRoot, 'profiles', 'v2', 'packages', 'builder.json'),
  );
  const taskMap = builderProfile && builderProfile.BuildTaskManager && builderProfile.BuildTaskManager.taskMap;
  const latestWebMobileTask = taskMap
    ? Object.values(taskMap)
      .filter((task) => task && task.options && task.options.platform === 'web-mobile')
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0]
    : null;
  const taskOptions = latestWebMobileTask
    && latestWebMobileTask.options
    && latestWebMobileTask.options.packages
    && latestWebMobileTask.options.packages['playable-ads-builder'];

  for (const source of [settings, profile, taskOptions]) {
    if (source && typeof source === 'object') {
      Object.assign(merged, source);
    }
  }

  return merged;
}

function resolvePlayableBuilderChannels(channelsModule, options) {
  const sorted = channelsModule && channelsModule.CHANNEL_SORTED;
  const fieldKey = channelsModule && channelsModule.channelFieldKey;
  if (!Array.isArray(sorted) || typeof fieldKey !== 'function') {
    return [];
  }
  return sorted.filter((channel) => options[fieldKey(channel)] === true);
}

async function readCocosEngineVersion(webMobileDir) {
  const settingsPath = path.join(webMobileDir, 'src', 'settings.json');
  const settings = await readJsonFile(settingsPath);
  const version = settings
    && settings.CocosEngine
    || settings && settings.assets && settings.assets.CocosEngine;
  if (version) {
    return String(version);
  }

  const raw = await fs.readFile(settingsPath, 'utf8').catch(() => '');
  const match = raw.match(/"CocosEngine"\s*:\s*"([^"]+)"/);
  return match ? match[1] : 'unknown';
}

async function isPackageNamed(packageRoot, expectedName) {
  const packageJson = await readJsonFile(path.join(packageRoot, 'package.json'));
  return packageJson && packageJson.name === expectedName;
}

async function resolveWebMobileBuildInfo(projectRoot) {
  const webMobileProfile = await readJsonFile(
    path.join(projectRoot, 'profiles', 'v2', 'packages', 'web-mobile.json'),
  );
  const builderProfile = await readJsonFile(
    path.join(projectRoot, 'profiles', 'v2', 'packages', 'builder.json'),
  );
  const webMobileCommon = webMobileProfile && webMobileProfile.builder && webMobileProfile.builder.common;
  const taskMap = builderProfile && builderProfile.BuildTaskManager && builderProfile.BuildTaskManager.taskMap;
  const latestWebMobileTask = taskMap
    ? Object.values(taskMap)
      .filter((task) => task && task.options && task.options.platform === 'web-mobile')
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0]
    : null;
  const taskOptions = latestWebMobileTask && latestWebMobileTask.options;
  const name = String(
    webMobileCommon && webMobileCommon.name
      || taskOptions && taskOptions.name
      || path.basename(projectRoot),
  ).trim();
  const outputName = String(
    webMobileCommon && webMobileCommon.outputName
      || taskOptions && taskOptions.outputName
      || 'web-mobile',
  ).trim();

  return { name, outputName };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

// Windows hay tra ve EPERM/EBUSY khi rename mot thu muc dang bi giu handle
// (Windows Defender, Search Indexer, File Explorer dang mo, preview server cua
// Cocos, hoac tien trinh build vua ghi xong file). Rename tren o dia khac thi
// tra ve EXDEV. Ca hai truong hop deu xu ly duoc bang retry + fallback copy.
const MOVE_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY', 'EEXIST', 'EXDEV']);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(from, to, attempts = 5) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!MOVE_RETRY_CODES.has(error && error.code)) {
        throw error;
      }
      // Khoa thuong chi ton tai vai tram ms -> lui dan roi thu lai.
      await wait(120 * (attempt + 1));
    }
  }

  throw lastError;
}

async function copyDirectory(from, to) {
  if (typeof fs.cp === 'function') {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, force: true });
    return;
  }

  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function analyzeExportRoot(exportRoot) {
  const files = await collectAllFiles(exportRoot);
  const rootEntries = await fs.readdir(exportRoot, { withFileTypes: true });
  const packages = [];

  for (const entry of rootEntries) {
    const fullPath = path.join(exportRoot, entry.name);
    if (entry.isDirectory()) {
      const packageFiles = await collectAllFiles(fullPath);
      packages.push({
        network: entry.name,
        relativePath: entry.name,
        kind: 'folder',
        fileCount: packageFiles.length,
        bytes: packageFiles.reduce((sum, file) => sum + file.size, 0),
      });
      continue;
    }
    // playable-ads-builder xuat .html cho kenh thuong va .zip cho kenh yeu cau
    // dong goi (Facebook, Google, TikTok, Mintegral...). Liet ke ca hai.
    const extension = path.extname(entry.name).toLowerCase();
    if (entry.isFile() && (extension === '.html' || extension === '.zip')) {
      const stat = await fs.stat(fullPath);
      packages.push({
        network: path.basename(entry.name, path.extname(entry.name)),
        relativePath: entry.name,
        kind: extension === '.zip' ? 'zip-package' : 'single-html',
        fileCount: 1,
        bytes: stat.size,
      });
    }
  }

  packages.sort((left, right) => right.bytes - left.bytes);
  const htmlFiles = files
    .filter((file) => path.extname(file.fullPath).toLowerCase() === '.html')
    .map((file) => {
      const relativePath = path.relative(exportRoot, file.fullPath).replace(/\\/g, '/');
      const segments = relativePath.split('/').filter(Boolean);
      const network = segments.length > 1 ? segments[0] : 'root';
      return {
        relativePath,
        network,
        bytes: file.size,
      };
    })
    .sort((left, right) => right.bytes - left.bytes);

  const totalExportBytes = files.reduce((sum, file) => sum + file.size, 0);
  const totalHtmlBytes = htmlFiles.reduce((sum, file) => sum + file.bytes, 0);

  return {
    totalExportBytes,
    totalHtmlBytes,
    packageCount: packages.length,
    packages,
    largestPackage: packages[0] || null,
    htmlFileCount: htmlFiles.length,
    htmlFiles,
    largestHtml: htmlFiles[0] || null,
    smallestHtml: htmlFiles.length ? htmlFiles[htmlFiles.length - 1] : null,
  };
}

async function resolveUuidFromUrl(url) {
  if (!url) {
    return '';
  }

  try {
    const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
    if (info && info.uuid) {
      return info.uuid;
    }
  } catch (_error) {
    // Some versions use object payloads.
  }

  try {
    const info = await Editor.Message.request('asset-db', 'query-asset-info', { url });
    if (info && info.uuid) {
      return info.uuid;
    }
  } catch (_error) {
    // Ignore and return empty below.
  }

  return '';
}

exports.load = function load() {
  console.log(`[${PACKAGE_NAME}] loaded`);
};

exports.unload = function unload() {};
