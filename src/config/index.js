const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file
dotenv.config();

const repoRoot = path.join(__dirname, '..', '..');

/**
 * Return the first candidate that exists on disk, or null when none match.
 * Guards against invalid / malformed paths instead of throwing.
 */
function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      /* ignore malformed path */
    }
  }
  return null;
}

/**
 * Resolve the Python interpreter used by the Faster-Whisper and Edge-TTS workers.
 * Priority:
 *   1. PYTHON_PATH from .env (when explicitly provided and file exists)
 *   2. Packaged Electron extraResources portable runtime (highest priority for installed desktop app)
 *   3. Project-local portable python runtime (./python-runtime)
 *   4. Project-local virtualenv (./.venv)
 *   5. Standard Windows Python installations (bypasses broken Windows Store alias / Code 103)
 *   6. Global "python" executable on PATH
 */
function resolvePythonPath() {
  const fromEnv = firstExistingPath([process.env.PYTHON_PATH]);
  if (fromEnv) return fromEnv;

  // 1. When bundled as an Electron desktop app, extraResources live in process.resourcesPath
  const resourcesDir = process.resourcesPath;
  if (resourcesDir) {
    const packagedRuntime = firstExistingPath([
      path.join(resourcesDir, 'python-runtime', 'python.exe'),
      path.join(resourcesDir, 'python-runtime', 'Scripts', 'python.exe'),
      path.join(resourcesDir, 'python', 'python.exe'),
      path.join(resourcesDir, 'python', 'Scripts', 'python.exe'),
      path.join(resourcesDir, '.venv', 'Scripts', 'python.exe'),
      path.join(resourcesDir, '.venv', 'Scripts', 'python3.exe'),
    ]);
    if (packagedRuntime) return packagedRuntime;
  }

  // 2. Project-local portable python runtime (100% self-contained, zero hardcoded user paths)
  const projectPortableRuntime = firstExistingPath([
    path.join(repoRoot, 'python-runtime', 'python.exe'),
    path.join(repoRoot, 'python-runtime', 'Scripts', 'python.exe'),
  ]);
  if (projectPortableRuntime) return projectPortableRuntime;

  // 3. Project-local virtualenv (development fallback)
  const localVenv = firstExistingPath([
    path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, '.venv', 'Scripts', 'python3.exe'),
    path.join(repoRoot, '.venv', 'bin', 'python3'),
    path.join(repoRoot, '.venv', 'bin', 'python'),
  ]);
  if (localVenv) return localVenv;

  // 4. Standard Windows Python installations (prevents Windows Store stub error code 103)
  const standardWindowsPaths = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];

  ['Python312', 'Python311', 'Python310', 'Python313', 'Python314'].forEach((ver) => {
    if (localAppData) {
      standardWindowsPaths.push(path.join(localAppData, 'Programs', 'Python', ver, 'python.exe'));
    }
    if (programFiles) {
      standardWindowsPaths.push(path.join(programFiles, 'Python', ver, 'python.exe'));
      standardWindowsPaths.push(path.join(programFiles, ver, 'python.exe'));
    }
    if (programFilesX86) {
      standardWindowsPaths.push(path.join(programFilesX86, 'Python', ver, 'python.exe'));
    }
  });

  const discoveredStandardPython = firstExistingPath(standardWindowsPaths);
  if (discoveredStandardPython) return discoveredStandardPython;

  return 'python';
}

/**
 * Directories that must be prepended to PATH so the Python workers can find a
 * bundled FFmpeg binary (PyAV / imageio-ffmpeg ship one inside the virtualenv).
 */
function resolveFfmpegBinDirs(pythonExecutable) {
  const dirs = [];

  if (process.env.FFMPEG_BIN_DIR) {
    dirs.push(process.env.FFMPEG_BIN_DIR);
  }

  // Check packaged Electron resources directory for bundled ffmpeg
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'ffmpeg'));
    dirs.push(path.join(process.resourcesPath, 'bin'));
  }

  if (pythonExecutable && pythonExecutable !== 'python') {
    // <venv>/Scripts/python.exe  ->  <venv>/Lib/site-packages/imageio_ffmpeg/binaries
    const venvRoot = path.dirname(path.dirname(pythonExecutable));
    dirs.push(path.join(venvRoot, 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries'));
    dirs.push(path.join(venvRoot, 'lib', 'site-packages', 'imageio_ffmpeg', 'binaries'));

    // <python-runtime>/python.exe -> <python-runtime>/Lib/site-packages/imageio_ffmpeg/binaries
    const runtimeRoot = path.dirname(pythonExecutable);
    dirs.push(path.join(runtimeRoot, 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries'));
    dirs.push(path.join(runtimeRoot, 'site-packages', 'imageio_ffmpeg', 'binaries'));
  }

  return dirs.filter((dir) => firstExistingPath([dir]) !== null);
}

const pythonPath = resolvePythonPath();
const ffmpegBinDirs = resolveFfmpegBinDirs(pythonPath);

// Prepend bundled FFmpeg directories to process.env.PATH so any spawn('ffmpeg') finds it automatically
if (ffmpegBinDirs && ffmpegBinDirs.length > 0) {
  process.env.PATH = ffmpegBinDirs.join(path.delimiter) + path.delimiter + process.env.PATH;
}

/**
 * Resolve writable storage directory.
 * When packaged in Electron, writes must never target read-only app.asar.
 * Priority:
 *   1. APP_STORAGE_DIR (set by Electron main process to appData / userData)
 *   2. Packaged fallback: path.join(path.dirname(process.resourcesPath), 'storage')
 *   3. Development fallback: <repoRoot>/storage
 */
function resolveStorageDir() {
  if (process.env.APP_STORAGE_DIR) {
    return process.env.APP_STORAGE_DIR;
  }
  if (process.resourcesPath && !process.defaultApp) {
    return path.join(path.dirname(process.resourcesPath), 'storage');
  }
  return path.join(repoRoot, 'storage');
}

const storageDir = resolveStorageDir();

// Pre-create subdirectories safely
try {
  [
    storageDir,
    path.join(storageDir, 'voices'),
    path.join(storageDir, 'videos'),
    path.join(storageDir, 'exports'),
    path.join(storageDir, 'history'),
    path.join(storageDir, 'temp'),
    path.join(storageDir, 'projects'),
    path.join(storageDir, 'rvc_models'),
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
} catch (_) {}

const config = {
  port: process.env.PORT || 28989,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Bulk subtitle payloads (translate / video-generate / project-save) can reach
  // several MB, which is far above Express' default 100kb body limit.
  bodyLimit: process.env.BODY_LIMIT || '50mb',

  // External process configuration shared by every worker service.
  pythonPath,
  ffmpegBinDirs,

  repoRoot,
  storageDir,
};

module.exports = config;

