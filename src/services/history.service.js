const fs = require('fs');
const path = require('path');
const config = require('../config');
const { formatTerminalLog } = require('../utils/terminal-logger');

class HistoryService {
  constructor() {
    this.historyDir = path.join(config.storageDir, 'history');
    this.historyFilePath = path.join(this.historyDir, 'video_history.json');
    this.videosDir = path.join(config.storageDir, 'videos');
    this.exportsDir = path.join(config.storageDir, 'exports');
    this.voicesDir = path.join(config.storageDir, 'voices');
    this.tempDir = path.join(config.storageDir, 'temp');
    this.projectsDir = path.join(config.storageDir, 'projects');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyFilePath)) {
      fs.writeFileSync(this.historyFilePath, JSON.stringify([], null, 2), 'utf-8');
    }
    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
    if (!fs.existsSync(this.voicesDir)) {
      fs.mkdirSync(this.voicesDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  /**
   * Load history from JSON file
   */
  _readHistoryFile() {
    try {
      this.ensureDirs();
      const content = fs.readFileSync(this.historyFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      formatTerminalLog('HISTORY:READ_ERR', `Failed to read history file: ${err.message}`);
      return [];
    }
  }

  /**
   * Save history to JSON file
   */
  _writeHistoryFile(items) {
    try {
      this.ensureDirs();
      fs.writeFileSync(this.historyFilePath, JSON.stringify(items, null, 2), 'utf-8');
    } catch (err) {
      formatTerminalLog('HISTORY:WRITE_ERR', `Failed to write history file: ${err.message}`);
    }
  }

  /**
   * Auto-discover existing video files from storage/videos and storage/exports
   * so that pre-existing files are automatically indexed.
   */
  _scanAndSyncDisk(currentItems) {
    const itemMap = new Map();
    currentItems.forEach(item => {
      if (item && item.filePath && fs.existsSync(item.filePath)) {
        itemMap.set(path.resolve(item.filePath), item);
      }
    });

    // 1. Scan storage/videos/dubbed_*.mp4
    if (fs.existsSync(this.videosDir)) {
      const videoFiles = fs.readdirSync(this.videosDir);
      for (const f of videoFiles) {
        if (f.startsWith('dubbed_') && f.endsWith('.mp4')) {
          const fullPath = path.resolve(path.join(this.videosDir, f));
          if (!itemMap.has(fullPath)) {
            try {
              const stat = fs.statSync(fullPath);
              const sizeMb = Math.round((stat.size / (1024 * 1024)) * 100) / 100;
              itemMap.set(fullPath, {
                id: `dubbed_${stat.birthtimeMs || stat.mtimeMs || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'dubbed',
                fileName: f,
                filePath: fullPath,
                url: `/storage/videos/${f}`,
                sizeMb,
                quality: 'dubbed',
                createdAt: stat.birthtime || stat.mtime || new Date().toISOString()
              });
            } catch (_) {}
          }
        }
      }
    }

    // 2. Scan storage/exports/*.mp4
    if (fs.existsSync(this.exportsDir)) {
      const scanExports = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullEntryPath = path.resolve(path.join(dir, entry.name));
          if (entry.isDirectory()) {
            scanExports(fullEntryPath);
          } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
            if (!itemMap.has(fullEntryPath)) {
              try {
                const stat = fs.statSync(fullEntryPath);
                const sizeMb = Math.round((stat.size / (1024 * 1024)) * 100) / 100;
                const relPath = path.relative(this.exportsDir, fullEntryPath).replace(/\\/g, '/');
                itemMap.set(fullEntryPath, {
                  id: `export_${stat.birthtimeMs || stat.mtimeMs || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  type: 'export',
                  fileName: entry.name,
                  filePath: fullEntryPath,
                  url: `/storage/exports/${relPath}`,
                  sizeMb,
                  quality: 'exported',
                  createdAt: stat.birthtime || stat.mtime || new Date().toISOString()
                });
              } catch (_) {}
            }
          }
        }
      };
      scanExports(this.exportsDir);
    }

    const syncedItems = Array.from(itemMap.values());
    // Sort descending by createdAt
    syncedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this._writeHistoryFile(syncedItems);
    return syncedItems;
  }

  /**
   * Helper to compute file count and total size in MB for a directory
   */
  _getFolderStats(dirPath) {
    if (!fs.existsSync(dirPath)) return { count: 0, sizeMb: 0 };
    let count = 0;
    let totalBytes = 0;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file === '.gitkeep') continue;
        const fullPath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            count++;
            totalBytes += stat.size;
          }
        } catch (_) {}
      }
    } catch (_) {}
    return {
      count,
      sizeMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100
    };
  }

  /**
   * Get all history items with aggregate stats and storage breakdown
   */
  getHistory() {
    const rawItems = this._readHistoryFile();
    const items = this._scanAndSyncDisk(rawItems);
    const totalCount = items.length;
    const totalSizeBytes = items.reduce((acc, it) => acc + (it.sizeMb || 0), 0);
    const totalSizeMb = Math.round(totalSizeBytes * 100) / 100;

    const voicesStats = this._getFolderStats(this.voicesDir);
    const tempStats = this._getFolderStats(this.tempDir);

    const grandTotalSizeMb = Math.round((totalSizeMb + voicesStats.sizeMb + tempStats.sizeMb) * 100) / 100;

    return {
      items,
      totalCount,
      totalSizeMb,
      storageStats: {
        videos: { count: totalCount, sizeMb: totalSizeMb },
        voices: voicesStats,
        temp: tempStats,
        grandTotalSizeMb
      }
    };
  }

  /**
   * Add a new history record
   */
  addRecord({ type = 'dubbed', fileName, filePath, url, sizeMb = 0, quality = 'default', originalName = '' }) {
    const items = this._readHistoryFile();
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullPath = path.resolve(filePath);

    // Remove any previous entry with identical full path
    const filtered = items.filter(it => path.resolve(it.filePath || '') !== fullPath);

    const record = {
      id,
      type,
      fileName,
      filePath: fullPath,
      url,
      sizeMb: Math.round(sizeMb * 100) / 100,
      quality,
      originalName: originalName || fileName,
      createdAt: new Date().toISOString()
    };

    filtered.unshift(record);
    this._writeHistoryFile(filtered);
    formatTerminalLog('HISTORY:RECORD_ADDED', `Logged video history: ${fileName} (${sizeMb} MB)`);
    return record;
  }

  /**
   * Delete single history item and remove its physical file from disk
   */
  deleteRecord(id) {
    const items = this._readHistoryFile();
    const target = items.find(it => it.id === id || it.fileName === id);
    if (!target) {
      throw new Error(`History record not found: ${id}`);
    }

    // Delete physical file
    if (target.filePath && fs.existsSync(target.filePath)) {
      try {
        fs.unlinkSync(target.filePath);
        formatTerminalLog('HISTORY:FILE_DELETED', `Deleted file from disk: ${target.filePath}`);
      } catch (err) {
        formatTerminalLog('HISTORY:FILE_DEL_WARN', `Could not delete file ${target.filePath}: ${err.message}`);
      }
    }

    const updated = items.filter(it => it.id !== target.id);
    this._writeHistoryFile(updated);
    return { success: true, deletedId: target.id, fileName: target.fileName };
  }

  /**
   * Clear all history records and delete requested files via clearAllHistory()
   */
  clearAllHistory(options = {}) {
    const { items } = this.getHistory();
    const {
      clearVideos = true,
      clearVoices = true,
      clearTemp = true,
      clearProjects = true
    } = options;

    let deletedCount = 0;
    let deletedBytes = 0;

    // 1. Clear Videos in history
    if (clearVideos !== false) {
      for (const item of items) {
        if (item.filePath && fs.existsSync(item.filePath)) {
          try {
            const stat = fs.statSync(item.filePath);
            deletedBytes += stat.size;
            fs.unlinkSync(item.filePath);
            deletedCount++;
          } catch (err) {
            formatTerminalLog('HISTORY:CLEAR_WARN', `Failed to delete ${item.filePath}: ${err.message}`);
          }
        }
      }
      this._writeHistoryFile([]);
    }

    // 2. Clear Voices (storage/voices/*.mp3, *.wav, *.meta.json)
    if (clearVoices !== false && fs.existsSync(this.voicesDir)) {
      try {
        const voiceFiles = fs.readdirSync(this.voicesDir);
        for (const vf of voiceFiles) {
          if (vf === '.gitkeep') continue;
          const fullPath = path.join(this.voicesDir, vf);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              deletedBytes += stat.size;
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          } catch (_) {}
        }
      } catch (err) {
        formatTerminalLog('HISTORY:CLEAR_VOICES_ERR', `Failed to clear voices: ${err.message}`);
      }
    }

    // 3. Clear Temp cache & stems (storage/temp/*)
    if (clearTemp !== false && fs.existsSync(this.tempDir)) {
      try {
        const tempFiles = fs.readdirSync(this.tempDir);
        for (const tf of tempFiles) {
          if (tf === '.gitkeep') continue;
          const fullPath = path.join(this.tempDir, tf);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              deletedBytes += stat.size;
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          } catch (_) {}
        }
      } catch (err) {
        formatTerminalLog('HISTORY:CLEAR_TEMP_ERR', `Failed to clear temp: ${err.message}`);
      }
    }

    // 4. Clear Projects if requested (storage/projects/*)
    if (clearProjects !== false && fs.existsSync(this.projectsDir)) {
      try {
        const projFiles = fs.readdirSync(this.projectsDir);
        for (const pf of projFiles) {
          if (pf === '.gitkeep') continue;
          const fullPath = path.join(this.projectsDir, pf);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              deletedBytes += stat.size;
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    const freedMb = Math.round((deletedBytes / (1024 * 1024)) * 100) / 100;
    formatTerminalLog('HISTORY:CLEARED_ALL', `Deep cleaned storage: ${deletedCount} files deleted (${freedMb} MB freed)`);
    return {
      success: true,
      clearedCount: items.length,
      deletedFilesCount: deletedCount,
      freedMb
    };
  }
}

module.exports = new HistoryService();
