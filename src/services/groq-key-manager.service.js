const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '../../.groq-key-status.json');
const TEN_MINUTES_MS = 10 * 60 * 1000;

class GroqKeyManagerService {
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
      console.warn('[GroqKeyManager] Could not load .groq-key-status.json, starting fresh:', e.message);
      this.keyStates = {};
    }
  }

  saveState() {
    try {
      fs.writeFileSync(STATUS_FILE, JSON.stringify(this.keyStates, null, 2), 'utf8');
    } catch (e) {
      console.warn('[GroqKeyManager] Failed to persist .groq-key-status.json:', e.message);
    }
  }

  purgeExpired(customApiKey = null) {
    const now = Date.now();
    const configured = new Set(this.getConfiguredKeys(customApiKey));
    let modified = false;

    for (const [keyHash, state] of Object.entries(this.keyStates)) {
      if (!configured.has(keyHash)) {
        delete this.keyStates[keyHash];
        modified = true;
        continue;
      }
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
    if (trimmed.length <= 10) return trimmed;
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
    if (process.env.GROQ_API_KEY) {
      keys.push(...this.parseKeys(process.env.GROQ_API_KEY));
    }
    try {
      const envPath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        let capturing = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GROQ_API_KEY=')) {
            capturing = true;
            const val = trimmed.replace('GROQ_API_KEY=', '').replace(/^["']/, '').replace(/["']$/, '');
            keys.push(...this.parseKeys(val));
          } else if (capturing) {
            if (trimmed.startsWith('#') || (trimmed.includes('=') && !trimmed.startsWith('gsk_'))) {
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
      throw new Error('Groq API Key មិនទាន់ត្រូវបានកំណត់ទេ។ សូមបញ្ចូល API Key ក្នុង Settings ឬក្នុង .env');
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
        throw new Error(`រាល់ Groq API Keys ទាំងអស់ (${keys.length}) មិនត្រឹមត្រូវ ឬត្រូវបានបិទសិទ្ធិ (Denied Access)។ សូមបញ្ចូល API Key ថ្មី។`);
      }
      const waitMins = Math.max(1, Math.ceil((earliestUnlock - now) / (60 * 1000)));
      throw new Error(`រាល់ Groq API Keys ទាំងអស់ (${keys.length}) បានជាប់ Rate Limit (429) រួចហើយ។ សូមបញ្ចូល Key ថ្មីបន្ថែម ឬរង់ចាំប្រហែល ${waitMins} នាទីទៀត។`);
    }

    this.roundRobinIndex = this.roundRobinIndex % readyKeys.length;
    const selectedKey = readyKeys[this.roundRobinIndex];
    const originalIndex = keys.indexOf(selectedKey);
    this.roundRobinIndex = (this.roundRobinIndex + 1) % readyKeys.length;

    return {
      key: selectedKey,
      id: this.getKeyId(selectedKey),
      totalConfigured: keys.length,
      readyCount: readyKeys.length,
      index: originalIndex
    };
  }

  parseCooldownMs(errorMessage) {
    if (!errorMessage || typeof errorMessage !== 'string') return TEN_MINUTES_MS;
    
    // Look for: "try again in 10m3.5s" or "try again in 5m" or "try again in 45s"
    const mMatch = errorMessage.match(/([0-9.]+)\s*m/i);
    const sMatch = errorMessage.match(/([0-9.]+)\s*s/i);

    let ms = 0;
    if (mMatch) ms += parseFloat(mMatch[1]) * 60 * 1000;
    if (sMatch) ms += parseFloat(sMatch[1]) * 1000;

    // Buffer +10 seconds safety
    if (ms > 0) return ms + 10000;
    return TEN_MINUTES_MS;
  }

  markRateLimited(key, errorMessage = '') {
    if (!key) return;
    const cooldownMs = this.parseCooldownMs(errorMessage);
    const lockedUntil = Date.now() + cooldownMs;
    const waitMins = Math.ceil(cooldownMs / (60 * 1000));

    this.keyStates[key] = {
      status: 'RATE_LIMITED',
      lockedUntil,
      lockedAt: Date.now(),
      reason: `Rate limit 429: រង់ចាំ ~${waitMins} នាទី (${errorMessage.slice(0, 100)})`,
      errorSnippet: errorMessage.slice(0, 150)
    };
    this.saveState();
  }

  markDenied(key, errorMessage = '') {
    if (!key) return;
    this.keyStates[key] = {
      status: 'DENIED_ACCESS',
      lockedUntil: Infinity,
      lockedAt: Date.now(),
      reason: 'Invalid API Key / Authentication Failed',
      errorSnippet: errorMessage.slice(0, 150)
    };
    this.saveState();
  }

  markSuccess(key) {
    if (!key) return;
    if (this.keyStates[key]) {
      delete this.keyStates[key];
      this.saveState();
    }
  }

  getStatus(customApiKey = null) {
    this.purgeExpired(customApiKey);
    const keys = this.getConfiguredKeys(customApiKey);
    const now = Date.now();

    const result = {
      total: keys.length,
      healthy: 0,
      rateLimited: 0,
      denied: 0,
      keys: []
    };

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const state = this.keyStates[k];
      const isDenied = state && (state.status === 'DENIED_ACCESS' || state.lockedUntil === Infinity);
      const isLocked = state && state.lockedUntil && state.lockedUntil > now;

      let status = 'HEALTHY';
      let remainingMs = 0;

      if (isDenied) {
        status = 'DENIED_ACCESS';
        result.denied++;
      } else if (isLocked) {
        status = 'RATE_LIMITED';
        remainingMs = state.lockedUntil - now;
        result.rateLimited++;
      } else {
        result.healthy++;
      }

      result.keys.push({
        id: this.getKeyId(k),
        index: i + 1,
        status,
        remainingMs,
        remainingMins: Math.ceil(remainingMs / (60 * 1000)),
        reason: state?.reason || 'Ready'
      });
    }

    return result;
  }
}

module.exports = new GroqKeyManagerService();
