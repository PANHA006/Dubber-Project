/**
 * Test: Groq Multi-Key Management and Auto-Failover
 */

const assert = require('assert');
const groqKeyManager = require('../src/services/groq-key-manager.service.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

console.log('================================================================');
console.log('   🧪 GROQ MULTI-KEY POOL & AUTO-FAILOVER VERIFICATION');
console.log('================================================================\n');

check('parseKeys correctly handles comma, newline, and semicolon separated keys', () => {
  const input = `
    gsk_key1_1111111111, gsk_key2_2222222222;
    "gsk_key3_3333333333"
    gsk_key4_4444444444
  `;
  const keys = groqKeyManager.parseKeys(input);
  assert.strictEqual(keys.length, 4);
  assert.strictEqual(keys[0], 'gsk_key1_1111111111');
  assert.strictEqual(keys[1], 'gsk_key2_2222222222');
  assert.strictEqual(keys[2], 'gsk_key3_3333333333');
  assert.strictEqual(keys[3], 'gsk_key4_4444444444');
});

check('getKeyId masks key securely (first 6 and last 4 characters)', () => {
  const key = 'gsk_abc123456789xyz';
  const id = groqKeyManager.getKeyId(key);
  assert.strictEqual(id, 'gsk_ab...9xyz');
});

check('parseCooldownMs accurately extracts minutes and seconds from Groq error snippet', () => {
  const err1 = "Rate limit reached. Please try again in 10m3.5s. Need more tokens?";
  const ms1 = groqKeyManager.parseCooldownMs(err1);
  // 10m (600,000) + 3.5s (3500) + buffer (10,000) = 613,500ms
  assert(ms1 >= 600000 && ms1 <= 620000);

  const err2 = "Please try again in 45s.";
  const ms2 = groqKeyManager.parseCooldownMs(err2);
  // 45s (45,000) + buffer (10,000) = 55,000ms
  assert(ms2 >= 50000 && ms2 <= 60000);
});

check('getActiveKey rotates keys in round-robin order', () => {
  const pool = 'gsk_testA_1111111111, gsk_testB_2222222222';
  
  // Clear any existing state for test keys
  groqKeyManager.markSuccess('gsk_testA_1111111111');
  groqKeyManager.markSuccess('gsk_testB_2222222222');

  const first = groqKeyManager.getActiveKey(pool);
  const second = groqKeyManager.getActiveKey(pool);

  assert(first.key !== second.key, 'Subsequent calls must rotate across distinct ready keys');
  assert.strictEqual(first.totalConfigured, 2);
  assert.strictEqual(first.readyCount, 2);
});

check('auto-failover skips rate-limited key and selects next healthy key', () => {
  const pool = 'gsk_fail1_1111111111, gsk_live2_2222222222';
  
  // Mark key 1 as rate limited (HTTP 429)
  groqKeyManager.markRateLimited('gsk_fail1_1111111111', 'Rate limit reached. Please try again in 10m.');

  // getActiveKey should skip key 1 and return key 2
  const active = groqKeyManager.getActiveKey(pool);
  assert.strictEqual(active.key, 'gsk_live2_2222222222');
  assert.strictEqual(active.readyCount, 1);
});

check('markDenied blocks invalid key with permanent lockout', () => {
  const pool = 'gsk_denied_1111111111, gsk_valid_2222222222';
  
  groqKeyManager.markDenied('gsk_denied_1111111111', 'Invalid API Key');
  const active = groqKeyManager.getActiveKey(pool);
  assert.strictEqual(active.key, 'gsk_valid_2222222222');
});

check('throws informative error when all keys are exhausted', () => {
  const pool = 'gsk_exhausted_1111111111';
  groqKeyManager.markRateLimited('gsk_exhausted_1111111111', 'Please try again in 5m.');

  assert.throws(() => {
    groqKeyManager.getActiveKey(pool);
  }, /បានជាប់ Rate Limit/);
});

console.log('\n================================================================');
console.log(`   🎉 ALL ${passed} GROQ MULTI-KEY TESTS PASSED!`);
console.log('================================================================\n');
