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

    // Delete physical file only if it lives inside project storageDir
    const storageRoot = path.resolve(config.storageDir);
    if (target.filePath && this._isPathInsideDir(target.filePath, storageRoot) && fs.existsSync(target.filePath)) {
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
   * Ensure targetPath is strictly inside baseDir so cleanup never touches files outside Dubber-Project.
   */
  _isPathInsideDir(targetPath, baseDir) {
    if (!targetPath || !baseDir) return false;
    try {
      const resolvedBase = path.resolve(baseDir);
      const resolvedTarget = path.resolve(targetPath);
      const rel = path.relative(
        process.platform === 'win32' ? resolvedBase.toLowerCase() : resolvedBase,
        process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget
      );
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch (_) {
      return false;
    }
  }

  /**
   * Recursively compute file count & byte size of a directory before removal.
   */
  _measureDirStats(dirPath) {
    let count = 0;
    let bytes = 0;
    try {
      for (const entry of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, entry);
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
          const sub = this._measureDirStats(full);
          count += sub.count;
          bytes += sub.bytes;
        } else {
          count++;
          bytes += stat.size;
        }
      }
    } catch (_) {}
    return { count, bytes };
  }

  /**
   * Remove all files and subdirectories inside dirPath (preserving .gitkeep),
   * strictly guarded to remain inside storageRoot.
   */
  _clearDirectoryContents(dirPath, storageRoot) {
    let deletedCount = 0;
    let deletedBytes = 0;
    if (!dirPath || !this._isPathInsideDir(dirPath, storageRoot) || !fs.existsSync(dirPath)) {
      return { deletedCount, deletedBytes };
    }

    try {
      for (const entry of fs.readdirSync(dirPath)) {
        if (entry === '.gitkeep') continue;
        const fullPath = path.join(dirPath, entry);
        try {
          const stat = fs.lstatSync(fullPath);
          if (stat.isDirectory()) {
            const sub = this._measureDirStats(fullPath);
            fs.rmSync(fullPath, { recursive: true, force: true });
            deletedCount += sub.count;
            deletedBytes += sub.bytes;
          } else {
            deletedBytes += stat.size;
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        } catch (_) {}
      }
    } catch (err) {
      formatTerminalLog('HISTORY:CLEAR_DIR_ERR', `Failed to clear ${dirPath}: ${err.message}`);
    }

    return { deletedCount, deletedBytes };
  }

  /**
   * Clear all history records and delete project-local storage files only.
   */
  clearAllHistory(options = {}) {
    const { items } = this.getHistory();
    const {
      clearVideos = true,
      clearVoices = true,
      clearTemp = true,
      clearProjects = true
    } = options;

    const storageRoot = path.resolve(config.storageDir);
    let deletedCount = 0;
    let deletedBytes = 0;

    // 1. Clear Videos in history + sweep storage/videos and storage/exports (project-only)
    if (clearVideos !== false) {
      for (const item of items) {
        if (item.filePath && this._isPathInsideDir(item.filePath, storageRoot) && fs.existsSync(item.filePath)) {
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

      const vidRes = this._clearDirectoryContents(this.videosDir, storageRoot);
      const expRes = this._clearDirectoryContents(this.exportsDir, storageRoot);
      deletedCount += vidRes.deletedCount + expRes.deletedCount;
      deletedBytes += vidRes.deletedBytes + expRes.deletedBytes;

      this._writeHistoryFile([]);
    }

    // 2. Clear Voices (storage/voices/*)
    if (clearVoices !== false) {
      const res = this._clearDirectoryContents(this.voicesDir, storageRoot);
      deletedCount += res.deletedCount;
      deletedBytes += res.deletedBytes;
    }

    // 3. Clear Temp cache & stems including subfolders (storage/temp/*)
    if (clearTemp !== false) {
      const res = this._clearDirectoryContents(this.tempDir, storageRoot);
      deletedCount += res.deletedCount;
      deletedBytes += res.deletedBytes;
    }

    // 4. Clear Projects (storage/projects/*)
    if (clearProjects !== false) {
      const res = this._clearDirectoryContents(this.projectsDir, storageRoot);
      deletedCount += res.deletedCount;
      deletedBytes += res.deletedBytes;
    }

    const freedMb = Math.round((deletedBytes / (1024 * 1024)) * 100) / 100;
    formatTerminalLog('HISTORY:CLEARED_ALL', `Deep cleaned project storage: ${deletedCount} files deleted (${freedMb} MB freed)`);
    return {
      success: true,
      clearedCount: items.length,
      deletedFilesCount: deletedCount,
      freedMb
    };
  }
}

const instance = new HistoryService();
instance.HistoryService = HistoryService;
module.exports = instance;
