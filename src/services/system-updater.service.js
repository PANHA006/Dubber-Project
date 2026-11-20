const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { formatTerminalLog } = require('../utils/terminal-logger');

class SystemUpdaterService {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..', '..');
    this.venvPython = path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe');
    this.venvPip = path.join(this.projectRoot, '.venv', 'Scripts', 'pip.exe');
    this.cachedStatus = null;
    this.lastCheckedAt = null;
  }

  /**
   * Helper to execute a command and capture stdout/stderr
   */
  async execCommand(cmd, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        windowsHide: true,
        shell: false,
        ...options
      });
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', chunk => { stdout += chunk.toString(); });
      proc.stderr?.on('data', chunk => { stderr += chunk.toString(); });

      proc.on('close', code => {
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });

      proc.on('error', err => {
        reject(err);
      });
    });
  }

  /**
   * Fetch latest package version from official PyPI JSON API
   */
  async fetchLatestPyPiVersion(packageName) {
    return new Promise((resolve) => {
      const url = `https://pypi.org/pypi/${packageName}/json`;
      const req = https.get(url, { headers: { 'User-Agent': 'DAI-Dubber-Updater/1.0' }, timeout: 6000 }, (res) => {
        if (res.statusCode !== 200) {
          return resolve(null);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.info?.version || null);
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Get installed version of FFmpeg
   */
  async getFFmpegVersion() {
    try {
      const { stdout } = await this.execCommand('ffmpeg', ['-version']);
      const match = stdout.match(/ffmpeg version\s+([^\s]+)/i);
      return match ? match[1] : 'Installed';
    } catch (_) {
      return 'Not Found';
    }
  }

  /**
   * Get installed version of Python
   */
  async getPythonVersion() {
    try {
      if (!fs.existsSync(this.venvPython)) {
        return 'Not Found (.venv missing)';
      }
      const { stdout } = await this.execCommand(this.venvPython, ['--version']);
      const match = stdout.match(/Python\s+([^\s]+)/i);
      return match ? match[1] : stdout || '3.x';
    } catch (_) {
      return 'Error';
    }
  }

  /**
   * Get installed version of a Python package in .venv
   */
  async getInstalledPythonPackageVersion(pkgName) {
    try {
      if (!fs.existsSync(this.venvPython)) return 'Not Installed';
      const script = `import importlib.metadata; print(importlib.metadata.version('${pkgName}'))`;
      const { code, stdout } = await this.execCommand(this.venvPython, ['-c', script]);
      if (code === 0 && stdout) {
        return stdout.trim();
      }
      return 'Not Installed';
    } catch (_) {
      return 'Unknown';
    }
  }

  /**
   * Compare semantic versions (e.g. '7.3.1' vs '7.4.0')
   */
  isNewerVersion(current, latest) {
    if (!current || !latest || current === 'Not Installed' || current === 'Unknown') return false;
    const cleanCur = current.replace(/[^0-9.]/g, '').split('.').map(Number);
    const cleanLat = latest.replace(/[^0-9.]/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(cleanCur.length, cleanLat.length); i++) {
      const c = cleanCur[i] || 0;
      const l = cleanLat[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  /**
   * Collect all dependencies and their update statuses
   */
  async getDependenciesStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedStatus && this.lastCheckedAt && (now - this.lastCheckedAt < 30000)) {
      return this.cachedStatus;
    }

    const [ffmpegVer, pythonVer] = await Promise.all([
      this.getFFmpegVersion(),
      this.getPythonVersion()
    ]);

    const packagesToCheck = [
      { id: 'edge-tts', name: 'Edge TTS (Microsoft Voices)', desc: 'ម៉ាស៊ីនបង្កើតសំឡេងខ្មែរ AI Neural Voice (Piseth / Sreymom)' },
      { id: 'faster-whisper', name: 'Faster-Whisper (Local STT)', desc: 'ម៉ាស៊ីនបំប្លែងសំឡេងទៅជាអក្សរ Local Speech-to-Text លើម៉ាស៊ីនផ្ទាល់' },
      { id: 'ctranslate2', name: 'CTranslate2 (Inference Engine)', desc: 'ម៉ាស៊ីនដំណើរការ Transformer Inference ល្បឿនលឿនសម្រាប់ Whisper' },
      { id: 'pip', name: 'Python Pip (Package Manager)', desc: 'ឧបករណ៍គ្រប់គ្រង និងដំឡើងកញ្ចប់ Python ក្នុង .venv' }
    ];

    const packageStatuses = await Promise.all(
      packagesToCheck.map(async (pkg) => {
        const current = await this.getInstalledPythonPackageVersion(pkg.id);
        const latest = await this.fetchLatestPyPiVersion(pkg.id);
        const hasUpdate = this.isNewerVersion(current, latest);
        return {
          id: pkg.id,
          name: pkg.name,
          desc: pkg.desc,
          currentVersion: current,
          latestVersion: latest || current,
          hasUpdate,
          status: hasUpdate ? 'update-available' : (current !== 'Not Installed' ? 'up-to-date' : 'missing')
        };
      })
    );

    const hasAnyUpdate = packageStatuses.some(p => p.hasUpdate);

    this.cachedStatus = {
      checkedAt: new Date().toISOString(),
      hasAnyUpdate,
      ffmpeg: {
        currentVersion: ffmpegVer,
        isInstalled: ffmpegVer !== 'Not Found',
        source: 'gyan.dev (Windows Full Build)',
        status: 'up-to-date'
      },
      python: {
        currentVersion: pythonVer,
        path: this.venvPython,
        status: pythonVer !== 'Not Found' ? 'healthy' : 'missing'
      },
      packages: packageStatuses
    };
    this.lastCheckedAt = now;

    return this.cachedStatus;
  }

  /**
   * Upgrade a specific Python package in .venv via pip
   */
  async updatePythonPackage(packageName) {
    if (!packageName) throw new Error('Package name is required');
    const allowed = ['edge-tts', 'faster-whisper', 'ctranslate2', 'pip'];
    if (!allowed.includes(packageName)) {
      throw new Error(`កញ្ចប់ ${packageName} មិនស្ថិតក្នុងបញ្ជីអនុញ្ញាតឱ្យអាប់ដេតឡើយ (Only core AI packages allowed)`);
    }

    if (!fs.existsSync(this.venvPython)) {
      throw new Error('រកមិនឃើញ Python .venv នៅក្នុងគម្រោងឡើយ');
    }

    formatTerminalLog('UPDATER:START', `Starting pip upgrade for package: ${packageName}...`);

    return new Promise((resolve, reject) => {
      const args = ['-m', 'pip', 'install', '--upgrade', packageName];
      const proc = spawn(this.venvPython, args, { windowsHide: true });
      let output = '';
      let errOutput = '';

      proc.stdout.on('data', d => {
        const text = d.toString();
        output += text;
        const line = text.trim().split('\n').pop() || '';
        if (line) formatTerminalLog('UPDATER:LOG', `[pip] ${line.slice(0, 110)}`);
      });

      proc.stderr.on('data', d => {
        errOutput += d.toString();
      });

      proc.on('close', async (code) => {
        if (code === 0) {
          this.cachedStatus = null; // Invalidate cache
          const newVersion = await this.getInstalledPythonPackageVersion(packageName);
          formatTerminalLog('UPDATER:DONE', `Successfully upgraded ${packageName} to version ${newVersion}!`);
          resolve({
            success: true,
            packageName,
            newVersion,
            message: `បានអាប់ដេត ${packageName} ទៅកាន់ជំនាន់ ${newVersion} ជោគជ័យ!`
          });
        } else {
          formatTerminalLog('UPDATER:ERR', `Failed to upgrade ${packageName}: ${errOutput.slice(-200)}`);
          reject(new Error(`បរាជ័យក្នុងការអាប់ដេត ${packageName}៖ ${errOutput.slice(-200) || output.slice(-200)}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Upgrade all essential AI packages (edge-tts + faster-whisper) in one go
   */
  async updateAllAiEngines() {
    if (!fs.existsSync(this.venvPython)) {
      throw new Error('រកមិនឃើញ Python .venv នៅក្នុងគម្រោងឡើយ');
    }

    formatTerminalLog('UPDATER:BATCH_START', 'Starting 1-Click upgrade for core AI engines (edge-tts, faster-whisper)...');

    const results = [];
    for (const pkg of ['edge-tts', 'faster-whisper']) {
      try {
        const res = await this.updatePythonPackage(pkg);
        results.push(res);
      } catch (err) {
        results.push({ success: false, packageName: pkg, error: err.message });
      }
    }

    this.cachedStatus = null; // Clear cache
    const updatedStatus = await this.getDependenciesStatus(true);

    return {
      success: results.every(r => r.success !== false),
      results,
      updatedStatus
    };
  }
}

module.exports = new SystemUpdaterService();
