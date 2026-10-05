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

function requestHttp(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null });
        } catch (_) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTest() {
  console.log('================================================================');
  console.log('   🔄 TEST: DYNAMIC TIME RECALCULATION & CACHE BUSTING ENGINE   ');
  console.log('================================================================\n');

  // --- 1. FRONTEND CODE AUDIT ---
  console.log('--- 1. AUDITING FRONTEND DYNAMIC DOM INSPECTION ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  const ttsWorkerPy = fs.readFileSync(path.join(__dirname, '../src/workers/tts_worker.py'), 'utf-8');

  assert(mainJs.includes('getFreshSubtitlePayloadItem'), 'main.js defines getFreshSubtitlePayloadItem helper');
  assert(mainJs.includes('sub-time-input'), 'main.js queries fresh .sub-time-input from DOM');
  assert(mainJs.includes('sub-text-input'), 'main.js queries fresh .sub-text-input from DOM');
  assert(mainJs.includes('parseTimecodeSRT(rawStart)'), 'main.js re-parses fresh start timecode');
  assert(mainJs.includes('parseTimecodeSRT(rawEnd)'), 'main.js re-parses fresh end timecode');
  assert(ttsWorkerPy.includes('version_tag'), 'tts_worker.py generates version_tag for cache busting');
  assert(ttsWorkerPy.includes('?v='), 'tts_worker.py appends ?v={version_tag} to audioUrl');
  assert(ttsWorkerPy.includes('min(1.35, max(1.05, needed_ratio))'), 'tts_worker.py caps speed at 1.35x maximum');

  // --- 2. LIVE TTS GENERATION & CACHE BUSTING TEST ---
  console.log('\n--- 2. TESTING LIVE RE-GENERATION & CACHE BUSTING ---');
  const testSubId = `test_recalc_${Date.now()}`;
  const voicesDir = path.join(__dirname, '../storage/voices');

  // Round 1: Generate initial voice with tight target duration (2.0s)
  const round1Payload = {
    items: [
      {
        id: testSubId,
        khmerText: 'នេះជាការសាកល្បងសំឡេងវែងសម្រាប់តេស្តល្បឿន',
        voice: 'Piseth (Male)',
        startSec: 10.0,
        endSec: 12.0,
        targetDuration: 2.0
      }
    ]
  };

  const res1 = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/generate-voice',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, round1Payload);

  assert(res1.statusCode === 200, 'Round 1 POST /api/generate-voice returned HTTP 200');
  const item1 = res1.body.data[0];
  assert(item1.success === true, 'Round 1 generation succeeded');
  assert(item1.audioUrl.includes('?v='), 'Round 1 audioUrl includes cache-busting query parameter');
  assert(item1.speedApplied > 1.0, `Round 1 speed was accelerated (${item1.speedApplied}x)`);
  assert(item1.speedApplied <= 1.35, `Round 1 speed clamped within 1.35x max (${item1.speedApplied}x)`);

  const file1Clean = item1.audioUrl.split('?')[0].replace('/storage/voices/', '');
  const file1Path = path.join(voicesDir, file1Clean);
  assert(fs.existsSync(file1Path), 'Round 1 file exists on disk: ' + file1Clean);

  // Round 2: User changes text to MUCH shorter ('បាទ') with generous time slot (4.0s)
  // System should re-calculate: speed must reset to 1.0x, file1 must be deleted, new version created!
  await new Promise(r => setTimeout(r, 100)); // ensure different millisecond timestamp
  const round2Payload = {
    items: [
      {
        id: testSubId,
        khmerText: 'បាទ',
        voice: 'Piseth (Male)',
        startSec: 10.0,
        endSec: 14.0, // generous 4.0s slot
        targetDuration: 4.0,
        oldAudioUrl: item1.audioUrl
      }
    ]
  };

  const res2 = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/generate-voice',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, round2Payload);

  assert(res2.statusCode === 200, 'Round 2 POST /api/generate-voice returned HTTP 200');
  const item2 = res2.body.data[0];
  assert(item2.success === true, 'Round 2 generation succeeded');
  assert(item2.audioUrl !== item1.audioUrl, 'Round 2 audioUrl is NEW and unique (cache busted)');
  assert(item2.speedApplied === 1.0, `Round 2 speed reset to normal 1.0x: ${item2.speedApplied}x`);

  const file2Clean = item2.audioUrl.split('?')[0].replace('/storage/voices/', '');
  const file2Path = path.join(voicesDir, file2Clean);
  assert(fs.existsSync(file2Path), 'Round 2 file exists on disk: ' + file2Clean);
  assert(!fs.existsSync(file1Path), 'Previous old audio file was cleanly deleted from storage/voices');

  // Clean up test file 2
  try { fs.unlinkSync(file2Path); } catch (_) {}

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

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
