/**
 * Automated Test Suite for:
 * 1. Time-Fitting & Auto-Speed Speech Generation based on startSec & endSec
 * 2. Automatic speed acceleration via ffmpeg atempo when audio exceeds targetDuration
 * 3. Preserving normal speed 1.0x when slot time is sufficient
 * 4. Backend Edge-TTS worker & HTTP API verification
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function postRequest(pathName, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runAutoSpeedTests() {
  console.log('\n================================================================');
  console.log('   ⚡ TEST SUITE: TIME-FITTING & AUTO-SPEED VOICE GENERATION     ');
  console.log('================================================================\n');

  const ttsService = require('../src/services/tts.service.js');
  const storageVoicesDir = path.join(__dirname, '../storage/voices');

  // --- 1. CODE & DOM AUDIT ---
  console.log('--- 1. AUDITING SOURCE CODE & BADGE RENDERING ---');
  const workerPy = fs.readFileSync(path.join(__dirname, '../src/workers/tts_worker.py'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  assert(workerPy.includes('atempo') && workerPy.includes('target_duration'), 'tts_worker.py contains atempo filter and target_duration logic');
  assert(subtitlesJs.includes('sub.speedApplied > 1.04') && subtitlesJs.includes('⚡'), 'subtitles.js renders speed indicator badge ⚡');
  assert(mainJs.includes('targetDuration') && mainJs.includes('speedApplied'), 'main.js calculates targetDuration and captures speedApplied');

  // --- 2. LONG SPEECH IN TIGHT SLOT (SPEED MUST ACCELERATE > 1.0x) ---
  console.log('\n--- 2. TESTING LONG SPEECH IN TIGHT TIME SLOT (MUST ACCELERATE) ---');
  const longItem = {
    id: `speed_test_tight_${Date.now()}`,
    khmerText: 'មេរៀនទីមួយនៃការសិក្សាភាសាខ្មែរតាមប្រព័ន្ធឌីជីថល',
    voice: 'Piseth (Male)',
    startSec: 1.0,
    endSec: 3.8,
    targetDuration: 2.8 // Naturally ~3.65s (trimmed) -> will be compressed to <= 2.9s
  };

  const tightResult = await ttsService.generateVoices([longItem]);
  assert(tightResult.success === true, 'ttsService generated speech successfully');
  const tightRes = tightResult.results[0];
  assert(tightRes.speedApplied > 1.05, `Speed was accelerated automatically: ${tightRes.speedApplied}x (target: 2.8s)`);
  assert(tightRes.duration <= 2.95, `Audio duration was compressed: ${tightRes.duration}s`);
  assert(fs.existsSync(path.join(storageVoicesDir, tightRes.filename)), `Generated audio file exists on disk: ${tightRes.filename}`);

  // Clean up
  try { fs.unlinkSync(path.join(storageVoicesDir, tightRes.filename)); } catch (_) {}

  // --- 3. SHORT SPEECH IN GENEROUS SLOT (NORMAL SPEED 1.0x) ---
  console.log('\n--- 3. TESTING SHORT SPEECH IN GENEROUS TIME SLOT (NORMAL SPEED) ---');
  const shortItem = {
    id: `speed_test_normal_${Date.now()}`,
    khmerText: 'សួស្តីបាទ',
    voice: 'Piseth (Male)',
    startSec: 1.0,
    endSec: 8.0,
    targetDuration: 7.0 // 7.0s is way longer than 1.5s speech -> should NOT accelerate
  };

  const normalResult = await ttsService.generateVoices([shortItem]);
  assert(normalResult.success === true, 'ttsService generated normal speech successfully');
  const normalRes = normalResult.results[0];
  assert(normalRes.speedApplied === 1.0, `Speed remained 1.0x (normal): ${normalRes.speedApplied}x`);
  assert(normalRes.duration < 3.0, `Duration remains natural: ${normalRes.duration}s`);

  // Clean up
  try { fs.unlinkSync(path.join(storageVoicesDir, normalRes.filename)); } catch (_) {}

  // --- 4. LIVE HTTP API TEST WITH TARGET DURATION ---
  console.log('\n--- 4. TESTING LIVE HTTP POST /api/generate-voice WITH TARGET DURATION ---');
  const httpRes = await postRequest('/api/generate-voice', {
    items: [
      {
        id: `http_speed_${Date.now()}`,
        khmerText: 'អរគុណបងប្អូនទាំងអស់គ្នាដែលបានតាមដានទស្សនាការផ្សាយផ្ទាល់',
        voice: 'Sreymom (Female)',
        startSec: 0,
        endSec: 2.2,
        targetDuration: 2.2
      }
    ]
  });

  assert(httpRes.statusCode === 200, `POST /api/generate-voice returned HTTP 200`);
  assert(httpRes.body.success === true, 'API response success is true');
  const apiItem = httpRes.body.data[0];
  assert(apiItem.speedApplied > 1.0, `API item returned speedApplied > 1.0 (${apiItem.speedApplied}x)`);
  assert(apiItem.audioUrl.startsWith('/storage/voices/'), 'Audio URL starts with /storage/voices/');

  // Clean up
  if (apiItem.filename) {
    try { fs.unlinkSync(path.join(storageVoicesDir, apiItem.filename)); } catch (_) {}
  }

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAutoSpeedTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
