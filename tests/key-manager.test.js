const fs = require('fs');
const path = require('path');
const keyManager = require('../src/services/key-manager.service');

console.log('=====================================================');
console.log('   MULTI-KEY & 24H LOCKOUT DEEP VERIFICATION');
console.log('=====================================================\n');

let failed = 0;

// Test 1: Key parsing with comma, newline, spaces, and semicolon
console.log('1. Testing Multi-Key String Parsing...');
const testInput = '  AIzaSyKeyA111111, AIzaSyKeyB222222;\nAIzaSyKeyC333333 \n AIzaSyKeyD444444  ';
const parsed = keyManager.parseKeys(testInput);
if (parsed.length === 4 && parsed[0] === 'AIzaSyKeyA111111' && parsed[3] === 'AIzaSyKeyD444444') {
  console.log('   ✅ PASS: Correctly parsed 4 keys from mixed delimiters');
} else {
  console.error('   ❌ FAIL: Parsed incorrect count:', parsed);
  failed++;
}

// Test 2: 24-Hour Lockout triggering on Daily Quota Error
console.log('\n2. Testing 24-Hour Lockout Triggering...');
const mockDailyError = {
  message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash',
  details: [{
    quotaMetric: 'generate_content_free_tier_requests',
    quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    quotaValue: '20'
  }]
};
const keyA = 'AIzaSyTest_DailyLockKey_A';
const keyB = 'AIzaSyTest_HealthyKey_B';

const lockResult = keyManager.markKeyExhausted(keyA, mockDailyError);
if (lockResult.isDailyLocked === true && lockResult.waitDurationSec === 86400) {
  console.log('   ✅ PASS: Key correctly locked for 86,400s (24 Hours)');
} else {
  console.error('   ❌ FAIL: Lock duration mismatch:', lockResult);
  failed++;
}

// Test 3: Active Key Selection skips locked key
console.log('\n3. Testing Smart Key Selection (Skip Locked)...');
const poolStr = keyA + ', ' + keyB;
const active = keyManager.getActiveKey(poolStr);
if (active.key !== keyA && (active.key === keyB || keyManager.readEnvKeys().includes(active.key))) {
  console.log('   ✅ PASS: Active key successfully skipped locked Key A (' + active.id + ')');
} else {
  console.error('   ❌ FAIL: Did not skip locked key, got:', active);
  failed++;
}

// Test 4: Persistence across restarts (.key-status.json)
console.log('\n4. Testing Disk Persistence Across Restarts...');
const statusFile = path.join(__dirname, '../.key-status.json');
if (fs.existsSync(statusFile)) {
  const fileContent = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  if (fileContent[keyA] && fileContent[keyA].status === 'LOCKED_24H') {
    console.log('   ✅ PASS: Key lockout status successfully persisted in .key-status.json');
  } else {
    console.error('   ❌ FAIL: .key-status.json missing Key A state');
    failed++;
  }
} else {
  console.error('   ❌ FAIL: .key-status.json was not created');
  failed++;
}

// Test 5: Auto-unlock after 24 hours
console.log('\n5. Testing Automatic Expiry & Unlock...');
keyManager.keyStates[keyA].lockedUntil = Date.now() - 1000; // Fast-forward time past 24h
keyManager.purgeExpired();
if (!keyManager.keyStates[keyA]) {
  console.log('   ✅ PASS: Expired key automatically purged and unlocked');
} else {
  console.error('   ❌ FAIL: Expired key was not purged');
  failed++;
}

// Test 6: 403 Error marks key as DENIED_ACCESS
console.log('\n6. Testing 403 Error marks key as DENIED_ACCESS...');
const mockDeniedError = {
  message: 'Your project has been denied access. Please contact support.',
  status: 'PERMISSION_DENIED',
  error: { code: 403 }
};
const keyDenied = 'AIzaSyTest_DeniedAccessKey_X';
const keyHealthy = 'AIzaSyTest_HealthyKey_Y';

const deniedResult = keyManager.markKeyExhausted(keyDenied, mockDeniedError);
if (deniedResult.isDenied === true && deniedResult.status === 'DENIED_ACCESS') {
  console.log('   ✅ PASS: Key correctly marked as DENIED_ACCESS');
} else {
  console.error('   ❌ FAIL: Did not mark as DENIED_ACCESS:', deniedResult);
  failed++;
}

// Test 7: Active key selection skips DENIED_ACCESS key
console.log('\n7. Testing Smart Key Selection skips DENIED_ACCESS key...');
const testPool = keyDenied + ', ' + keyHealthy;
const picked = keyManager.getActiveKey(testPool);
if (picked.key !== keyDenied && (picked.key === keyHealthy || keyManager.readEnvKeys().includes(picked.key))) {
  console.log('   ✅ PASS: Active key skipped DENIED_ACCESS key (' + picked.id + ')');
} else {
  console.error('   ❌ FAIL: Did not skip DENIED_ACCESS key, got:', picked);
  failed++;
}

// Test 8: purgeExpired does NOT delete DENIED_ACCESS key
console.log('\n8. Testing purgeExpired retains DENIED_ACCESS key...');
keyManager.purgeExpired();
if (keyManager.keyStates[keyDenied] && keyManager.keyStates[keyDenied].status === 'DENIED_ACCESS') {
  console.log('   ✅ PASS: DENIED_ACCESS key correctly preserved in state across purges');
} else {
  console.error('   ❌ FAIL: DENIED_ACCESS key was unexpectedly purged');
  failed++;
}

// Cleanup test keys
delete keyManager.keyStates[keyA];
delete keyManager.keyStates[keyB];
delete keyManager.keyStates[keyDenied];
delete keyManager.keyStates[keyHealthy];
keyManager.saveState();

console.log('\n=====================================================');
if (failed === 0) {
  console.log('🎉 ALL MULTI-KEY & 403/DENIED_ACCESS CHECKS PASSED (8/8)!\n');
} else {
  console.error('⚠️ FAILED CHECKS: ' + failed + '\n');
  process.exit(1);
}
