const fs = require('fs');
const path = require('path');
const { formatTerminalLog } = require('../utils/terminal-logger');

class HistoryService {
  constructor() {
    this.historyDir = path.join(__dirname, '../../storage/history');
    this.historyFilePath = path.join(this.historyDir, 'video_history.json');
    this.videosDir = path.join(__dirname, '../../storage/videos');
    this.exportsDir = path.join(__dirname, '../../storage/exports');
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
   * Get all history items with aggregate stats
   */
  getHistory() {
    const rawItems = this._readHistoryFile();
    const items = this._scanAndSyncDisk(rawItems);
    const totalCount = items.length;
    const totalSizeBytes = items.reduce((acc, it) => acc + (it.sizeMb || 0), 0);
    const totalSizeMb = Math.round(totalSizeBytes * 100) / 100;

    return {
      items,
      totalCount,
      totalSizeMb
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
   * Clear all history records and delete all associated video files from disk
   */
  clearAllHistory() {
    const { items } = this.getHistory();
    let deletedCount = 0;

    for (const item of items) {
      if (item.filePath && fs.existsSync(item.filePath)) {
        try {
          fs.unlinkSync(item.filePath);
          deletedCount++;
        } catch (err) {
          formatTerminalLog('HISTORY:CLEAR_WARN', `Failed to delete ${item.filePath}: ${err.message}`);
        }
      }
    }

    this._writeHistoryFile([]);
    formatTerminalLog('HISTORY:CLEARED_ALL', `Cleared all history: ${deletedCount} files deleted`);
    return {
      success: true,
      clearedCount: items.length,
      deletedFilesCount: deletedCount
    };
  }
}

module.exports = new HistoryService();
