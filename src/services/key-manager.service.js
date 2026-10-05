const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '../../.key-status.json');
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

class KeyManagerService {
  constructor() {
    this.keyStates = {};
    this.roundRobinIndex = 0;
    this.knownSessionKeys = new Set();
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(STATUS_FILE)) {
        const raw = fs.readFileSync(STATUS_FILE, 'utf8');
        this.keyStates = JSON.parse(raw) || {};
        this.purgeExpired();
      }
    } catch (e) {
      console.warn('[KeyManager] Could not load .key-status.json, starting fresh:', e.message);
      this.keyStates = {};
    }
  }

  saveState() {
    try {
      fs.writeFileSync(STATUS_FILE, JSON.stringify(this.keyStates, null, 2), 'utf8');
    } catch (e) {
      console.warn('[KeyManager] Failed to persist .key-status.json:', e.message);
    }
  }

  purgeExpired(customApiKey = null) {
    const now = Date.now();
    const configured = new Set(this.getConfiguredKeys(customApiKey));
    let modified = false;

    for (const [keyHash, state] of Object.entries(this.keyStates)) {
      // Drop entries for keys that are no longer configured in .env / Settings,
      // otherwise .key-status.json keeps growing with stale keys forever.
      if (!configured.has(keyHash)) {
        delete this.keyStates[keyHash];
        modified = true;
        continue;
      }
      // Keep permanent blocks until the key is removed or re-added.
      if (state.status === 'DENIED_ACCESS' || state.lockedUntil === Infinity) {
        continue;
      }
      if (state.lockedUntil && state.lockedUntil <= now) {
        delete this.keyStates[keyHash];
        modified = true;
      }
    }

    if (modified) {
      this.saveState();
    }
  }

  getKeyId(key) {
    if (!key || typeof key !== 'string') return 'unknown';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  parseKeys(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return [];
    return rawInput
      .split(/[\n,;]+/)
      .map(k => k.trim().replace(/^["']+|["']+$/g, ''))
      .filter(k => k.length > 5);
  }

  readEnvKeys() {
    const keys = [];
    if (process.env.GEMINI_API_KEY) {
      keys.push(...this.parseKeys(process.env.GEMINI_API_KEY));
    }
    try {
      const envPath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        let capturing = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GEMINI_API_KEY=')) {
            capturing = true;
            const val = trimmed.replace('GEMINI_API_KEY=', '').replace(/^["']/, '').replace(/["']$/, '');
            keys.push(...this.parseKeys(val));
          } else if (capturing) {
            if (trimmed.startsWith('#') || (trimmed.includes('=') && !trimmed.startsWith('AQ.') && !trimmed.startsWith('AIza'))) {
              capturing = false;
            } else if (trimmed.length > 5) {
              keys.push(...this.parseKeys(trimmed));
            }
          }
        }
      }
    } catch (_) {}
    return keys;
  }

  getConfiguredKeys(customApiKey = null) {
    const clientKeys = this.parseKeys(customApiKey);
    const envKeys = this.readEnvKeys();
    
    const all = [...clientKeys, ...envKeys, ...this.knownSessionKeys];
    const unique = [];
    for (const k of all) {
      if (!unique.includes(k)) unique.push(k);
    }
    return unique;
  }

  getActiveKey(customApiKey = null) {
    this.purgeExpired(customApiKey);
    const keys = this.getConfiguredKeys(customApiKey);
    if (keys.length === 0) {
      throw new Error('GEMINI_API_KEY មិនទាន់ត្រូវបានកំណត់ទេ។ សូមបញ្ចូល API Key ក្នុង Settings ឬក្នុងឯកសារ .env');
    }

    const now = Date.now();
    const readyKeys = keys.filter(k => {
      const state = this.keyStates[k];
      if (!state) return true;
      if (state.status === 'DENIED_ACCESS' || state.lockedUntil === Infinity) return false;
      return !state.lockedUntil || state.lockedUntil <= now;
    });

    if (readyKeys.length === 0) {
      let earliestUnlock = Infinity;
      for (const k of keys) {
        const state = this.keyStates[k];
        if (state && state.lockedUntil && state.lockedUntil < earliestUnlock && state.status !== 'DENIED_ACCESS') {
          earliestUnlock = state.lockedUntil;
        }
      }
      if (earliestUnlock === Infinity) {
        throw new Error(`រាល់ Gemini API Keys ទាំងអស់ (${keys.length}) ត្រូវបាន Google បិទសិទ្ធិ (Denied Access) ឬមិនអាចប្រើប្រាស់បាន។ សូមបញ្ចូល API Key ថ្មី។`);
      }
      const waitHours = Math.ceil((earliestUnlock - now) / (60 * 60 * 1000));
      const waitMins = Math.ceil((earliestUnlock - now) / (60 * 1000));
      const timeStr = waitHours > 1 ? `${waitHours} ម៉ោង` : `${waitMins} នាទី`;
      throw new Error(`រាល់ Gemini API Keys ទាំងអស់ (${keys.length}) បានជាប់កូតា ២៤ ម៉ោងរួចហើយ។ សូមបញ្ចូល API Key ថ្មី ឬរង់ចាំប្រហែល ${timeStr} ទៀត។`);
    }

    this.roundRobinIndex = this.roundRobinIndex % readyKeys.length;
    const selectedKey = readyKeys[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % readyKeys.length;

    return {
      key: selectedKey,
      id: this.getKeyId(selectedKey),
      totalConfigured: keys.length,
      remainingReady: readyKeys.length
    };
  }

  markKeyExhausted(key, err) {
    if (key && typeof key === 'string' && key.length > 5) {
      this.knownSessionKeys.add(key);
    }
    const errStr = (err && (err.message || JSON.stringify(err))) || '';
    
    const isDenied = errStr.includes('PERMISSION_DENIED') ||
                     errStr.includes('denied access') ||
                     errStr.includes('403') ||
                     errStr.includes('API_KEY_INVALID') ||
                     errStr.includes('API key not valid');

    const is503 = !isDenied && (
                  errStr.includes('503') ||
                  errStr.includes('UNAVAILABLE') ||
                  errStr.includes('high demand'));

    const isDaily = !isDenied && !is503 && (
                    errStr.includes('GenerateRequestsPerDay') ||
                    errStr.includes('PerDay') ||
                    errStr.includes('per day') ||
                    errStr.includes('quotaValue":"20"') ||
                    errStr.includes('quotaValue\": \"20\"') ||
                    errStr.includes('limit: 20'));

    const now = Date.now();
    let status;
    let lockedUntil;
    let waitDurationSec;
    let reason;

    if (isDenied) {
      status = 'DENIED_ACCESS';
      lockedUntil = Infinity;
      waitDurationSec = null;
      reason = 'PROJECT_DENIED_ACCESS';
    } else if (isDaily) {
      status = 'LOCKED_24H';
      lockedUntil = now + TWENTY_FOUR_HOURS_MS;
      waitDurationSec = 24 * 3600;
      reason = 'DAILY_QUOTA_24H';
    } else if (is503) {
      status = 'COOLDOWN';
      lockedUntil = now + 60 * 1000;
      waitDurationSec = 60;
      reason = 'SERVER_HIGH_DEMAND_503';
    } else {
      status = 'COOLDOWN';
      let delaySec = 60;
      const match = errStr.match(/retry in\s+([\d.]+)\s*s/i) || errStr.match(/retryDelay["']?:\s*["']?(\d+)s/i);
      if (match) {
        delaySec = Math.ceil(parseFloat(match[1])) + 2;
      }
      lockedUntil = now + delaySec * 1000;
      waitDurationSec = delaySec;
      reason = 'PER_MINUTE_RATE_LIMIT';
    }

    this.keyStates[key] = {
      keyId: this.getKeyId(key),
      status,
      reason,
      lockedAt: now,
      lockedUntil
    };

    this.saveState();

    let nextKeyInfo = null;
    try {
      nextKeyInfo = this.getActiveKey(key);
    } catch (_) {
      nextKeyInfo = null;
    }

    return {
      keyId: this.getKeyId(key),
      isDenied,
      isDailyLocked: isDaily,
      is503,
      status,
      lockedUntil,
      waitDurationSec,
      nextKeyInfo
    };
  }

  getStatusSummary(customApiKey = null) {
    this.purgeExpired(customApiKey);
    const keys = this.getConfiguredKeys(customApiKey);
    const now = Date.now();
    return keys.map(k => {
      const state = this.keyStates[k];
      if (state && state.status === 'DENIED_ACCESS') {
        return {
          keyId: this.getKeyId(k),
          status: 'DENIED_ACCESS',
          reason: state.reason || 'PROJECT_DENIED_ACCESS',
          lockedUntil: Infinity,
          remainingSec: 0
        };
      }
      const isLocked = state && state.lockedUntil && state.lockedUntil > now;
      return {
        keyId: this.getKeyId(k),
        status: isLocked ? state.status : 'READY',
        reason: isLocked ? state.reason : 'HEALTHY',
        lockedUntil: isLocked ? state.lockedUntil : null,
        remainingSec: isLocked ? Math.max(0, Math.ceil((state.lockedUntil - now) / 1000)) : 0
      };
    });
  }

  logPoolStatus(customApiKey = null) {
    const { formatTerminalLog, colors } = require('../utils/terminal-logger');
    const dailyQuotaPerKey = Number(process.env.GEMINI_DAILY_QUOTA_PER_KEY) || 20;
    this.purgeExpired(customApiKey);
    const summary = this.getStatusSummary(customApiKey);
    const total = summary.length;
    const readyCount = summary.filter(s => s.status === 'READY').length;
    const healthyCount = summary.filter(s => s.status !== 'DENIED_ACCESS').length;

    formatTerminalLog('KEY:POOL', `Total configured keys: ${total}`);
    if (total === 0) {
      console.log(`   ${colors.dim}↳${colors.reset} ${colors.yellow}⚠️ No API keys configured in .env or Settings modal!${colors.reset}`);
      return;
    }

    summary.forEach((item, idx) => {
      let statusStr = '';
      if (item.status === 'READY') {
        statusStr = `${colors.green}✅ READY${colors.reset}`;
      } else if (item.status === 'DENIED_ACCESS') {
        statusStr = `${colors.red}🚫 DENIED_ACCESS (Project Denied)${colors.reset}`;
      } else if (item.status === 'LOCKED_24H') {
        const hoursLeft = Math.max(1, Math.ceil(item.remainingSec / 3600));
        statusStr = `${colors.red}🔒 LOCKED_24H (Daily Quota${item.remainingSec > 0 ? `: ${hoursLeft}h left` : ''})${colors.reset}`;
      } else {
        statusStr = `${colors.yellow}⏳ COOLDOWN (${item.remainingSec}s left)${colors.reset}`;
      }
      console.log(`   ${colors.dim}↳${colors.reset} Key ${idx + 1}: [${colors.bright}${item.keyId}${colors.reset}] -> ${statusStr}`);
    });
    console.log(`   ${colors.dim}↳${colors.reset} ${colors.bright}Summary:${colors.reset} ${colors.green}${readyCount}/${total} keys ready to use!${colors.reset} (Total daily quota: ${healthyCount * dailyQuotaPerKey} requests)`);
  }
}

module.exports = new KeyManagerService();
