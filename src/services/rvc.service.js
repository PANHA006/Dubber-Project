const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { formatTerminalLog } = require('../utils/terminal-logger');

class RVCService {
  constructor() {
    this.modelsDir = path.join(__dirname, '../../storage/rvc_models');
    this.metadataFile = path.join(this.modelsDir, 'models.json');
    this.tempDir = path.join(__dirname, '../../storage/temp');
    this.workerPath = path.join(__dirname, '../workers/rvc_worker.py');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.metadataFile)) {
      fs.writeFileSync(this.metadataFile, JSON.stringify([], null, 2), 'utf8');
    }
  }

  getPythonPath() {
    return config.pythonPath;
  }

  /**
   * List all installed character models
   */
  async listModels() {
    this.ensureDirs();
    try {
      const data = fs.readFileSync(this.metadataFile, 'utf8');
      const models = JSON.parse(data || '[]');
      // Validate that the files actually exist on disk
      const validModels = models.filter(m => {
        const pthExists = m.pthPath && fs.existsSync(m.pthPath);
        return pthExists;
      });
      return validModels;
    } catch (err) {
      formatTerminalLog('RVC:ERROR', `Failed to read models.json: ${err.message}`);
      return [];
    }
  }

  /**
   * Get a specific model by ID
   */
  async getModel(id) {
    const models = await this.listModels();
    return models.find(m => m.id === id) || null;
  }

  /**
   * Save a newly uploaded character model
   * @param {Object} params
   * @param {string} params.name
   * @param {string} params.gender
   * @param {number} params.pitchDefault
   * @param {Object} pthFile - Express Multer file object
   * @param {Object} [indexFile] - Express Multer file object
   */
  async saveModel({ name, gender = 'Male', pitchDefault = 0 }, pthFile, indexFile = null) {
    this.ensureDirs();
    if (!pthFile) {
      throw new Error('Missing .pth model file');
    }

    const cleanName = (name || 'Character').trim();
    const id = `rvc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const safeBaseName = cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    // Move .pth file to storage/rvc_models
    const targetPthName = `${id}_${safeBaseName}.pth`;
    const targetPthPath = path.join(this.modelsDir, targetPthName);
    fs.renameSync(pthFile.path, targetPthPath);

    let targetIndexPath = null;
    let targetIndexName = null;
    if (indexFile && fs.existsSync(indexFile.path)) {
      targetIndexName = `${id}_${safeBaseName}.index`;
      targetIndexPath = path.join(this.modelsDir, targetIndexName);
      fs.renameSync(indexFile.path, targetIndexPath);
    }

    const modelRecord = {
      id,
      name: cleanName,
      gender: gender === 'Female' ? 'Female' : 'Male',
      pitchDefault: parseInt(pitchDefault, 10) || 0,
      pthFilename: targetPthName,
      pthPath: targetPthPath,
      pthSize: fs.statSync(targetPthPath).size,
      indexFilename: targetIndexName,
      indexPath: targetIndexPath,
      indexSize: targetIndexPath && fs.existsSync(targetIndexPath) ? fs.statSync(targetIndexPath).size : 0,
      createdAt: new Date().toISOString(),
      previewUrl: null
    };

    const models = await this.listModels();
    models.push(modelRecord);
    fs.writeFileSync(this.metadataFile, JSON.stringify(models, null, 2), 'utf8');

    formatTerminalLog('RVC:SAVED', `Installed character voice: "${cleanName}" (${id})`);
    return modelRecord;
  }

  /**
   * Delete a character model and its files
   */
  async deleteModel(id) {
    this.ensureDirs();
    const models = await this.listModels();
    const targetIndex = models.findIndex(m => m.id === id);
    if (targetIndex === -1) {
      throw new Error('Model not found');
    }

    const target = models[targetIndex];
    if (target.pthPath && fs.existsSync(target.pthPath)) {
      try { fs.unlinkSync(target.pthPath); } catch (_) {}
    }
    if (target.indexPath && fs.existsSync(target.indexPath)) {
      try { fs.unlinkSync(target.indexPath); } catch (_) {}
    }
    if (target.previewUrl) {
      const prevPath = path.join(__dirname, '../../', target.previewUrl.split('?')[0]);
      if (fs.existsSync(prevPath)) {
        try { fs.unlinkSync(prevPath); } catch (_) {}
      }
    }

    models.splice(targetIndex, 1);
    fs.writeFileSync(this.metadataFile, JSON.stringify(models, null, 2), 'utf8');
    formatTerminalLog('RVC:DELETED', `Deleted character model: ${target.name} (${id})`);
    return { success: true, id };
  }

  /**
   * Convert an audio file using RVC worker
   * @param {Object} options
   * @param {string} options.inputAudio - path to source audio (e.g. Edge TTS output)
   * @param {string} options.modelId - ID of character model
   * @param {number} [options.pitchShift] - semitones (-12 to +12)
   * @param {string} [options.outputAudio] - destination audio path
   */
  async convertAudio({ inputAudio, modelId, pitchShift, outputAudio }) {
    this.ensureDirs();
    const model = await this.getModel(modelId);
    if (!model) {
      throw new Error(`Character model not found: ${modelId}`);
    }

    if (!fs.existsSync(inputAudio)) {
      throw new Error(`Input audio file not found: ${inputAudio}`);
    }

    const effectivePitch = pitchShift !== undefined ? parseInt(pitchShift, 10) : model.pitchDefault;
    const pythonExe = this.getPythonPath();

    const tempPayloadFile = path.join(this.tempDir, `rvc_payload_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.json`);
    const payload = {
      action: 'convert',
      inputAudio: path.resolve(inputAudio),
      modelPath: path.resolve(model.pthPath),
      indexPath: model.indexPath ? path.resolve(model.indexPath) : '',
      pitchShift: effectivePitch,
      pitchAlgo: 'pm', // pm is CPU-friendly and reliable
      outputAudio: outputAudio ? path.resolve(outputAudio) : undefined
    };

    fs.writeFileSync(tempPayloadFile, JSON.stringify(payload), 'utf8');

    return new Promise((resolve, reject) => {
      formatTerminalLog('RVC:INFER', `Starting RVC conversion for ${path.basename(inputAudio)} with "${model.name}" (Pitch: ${effectivePitch})`);

      const child = spawn(pythonExe, [this.workerPath, tempPayloadFile], {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => { stdout += data.toString('utf8'); });
      child.stderr.on('data', data => { stderr += data.toString('utf8'); });

      child.on('close', code => {
        try { fs.unlinkSync(tempPayloadFile); } catch (_) {}

        if (code !== 0) {
          formatTerminalLog('RVC:ERROR', `RVC conversion worker exited with code ${code}. Stderr: ${stderr}`);
          return reject(new Error(stderr || `RVC worker exited with code ${code}`));
        }

        try {
          // Find JSON in stdout
          const trimmed = stdout.trim();
          const jsonStart = trimmed.indexOf('{');
          const jsonEnd = trimmed.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
            if (!parsed.success) {
              return reject(new Error(parsed.error || 'RVC conversion failed'));
            }
            formatTerminalLog('RVC:SUCCESS', `RVC conversion finished: ${path.basename(parsed.outputAudio)} (${parsed.duration}s)`);
            return resolve(parsed);
          }
          reject(new Error(`Invalid JSON output from RVC worker: ${stdout}`));
        } catch (parseErr) {
          reject(new Error(`Failed to parse RVC worker response: ${parseErr.message}. Output: ${stdout}`));
        }
      });

      child.on('error', err => {
        try { fs.unlinkSync(tempPayloadFile); } catch (_) {}
        reject(err);
      });
    });
  }
}

module.exports = new RVCService();
