/**
 * Comprehensive Review & Test Suite for:
 * 1. Generate Voice button & Subtitle Data table with SOUND column
 * 2. Khmer Edge-TTS worker & TTS Service (Piseth & Sreymom)
 * 3. File storage in storage/voices/ & static serving
 * 4. Audio playback lifecycle & UI state transitions (Pending vs Ready)
 * 5. State invalidation when editing text or changing voice profile
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

async function runReviewTests() {
  console.log('\n================================================================');
  console.log('   🔍 COMPREHENSIVE REVIEW & AUDIT: VOICE & SOUND SYSTEM        ');
  console.log('================================================================\n');

  // --- 1. DOM & STATIC CODE REVIEW ---
  console.log('--- 1. AUDITING SOURCE FILES & UI ELEMENTS ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  assert(indexHtml.includes('SOUND') && indexHtml.includes('volume-2'), 'index.html contains SOUND column header with volume-2 icon');
  assert(indexHtml.includes('id="btn-generate-voice"') && indexHtml.includes('generateAllVoice()'), 'index.html contains #btn-generate-voice with generateAllVoice()');
  assert(indexHtml.includes('data-lucide="mic"'), 'index.html #btn-generate-voice has mic icon');
  assert(subtitlesJs.includes('window.playVoice'), 'subtitles.js exports window.playVoice');
  assert(subtitlesJs.includes('stopVoicePlayback'), 'subtitles.js exports stopVoicePlayback');
  assert(subtitlesJs.includes('cursor-not-allowed') && subtitlesJs.includes('Pending'), 'subtitles.js renders gray disabled Pending icon for ungenerated rows');
  assert(subtitlesJs.includes('sub-voice-play-btn') && subtitlesJs.includes('Play'), 'subtitles.js renders interactive green button for ready rows');
  assert(subtitlesJs.includes('sub.selected = true') && subtitlesJs.includes("sub.status = 'Modified'"), 'subtitles.js auto-checks row and sets Modified status on Khmer text change');
  assert(subtitlesJs.includes("sub.voice !== e.target.value") && subtitlesJs.includes("sub.status = 'Modified'"), 'subtitles.js auto-checks row and sets Modified status on voice profile change');

  // --- 2. BACKEND WORKER & SERVICE CODE REVIEW ---
  console.log('\n--- 2. AUDITING PYTHON TTS WORKER & NODE TTS SERVICE ---');
  const workerPy = fs.readFileSync(path.join(__dirname, '../src/workers/tts_worker.py'), 'utf-8');
  const ttsService = require('../src/services/tts.service.js');

  assert(workerPy.includes('km-KH-PisethNeural') && workerPy.includes('km-KH-SreymomNeural'), 'Python worker maps Piseth and Sreymom to Microsoft Neural voices');
  assert(workerPy.includes('ffprobe') && workerPy.includes('format=duration'), 'Python worker uses ffprobe to get precise audio duration');
  assert(typeof ttsService.generateVoices === 'function', 'tts.service.js exports generateVoices function');

  // --- 3. LIVE GENERATION TEST VIA TTS SERVICE ---
  console.log('\n--- 3. TESTING DIRECT VOICE GENERATION (MALE & FEMALE) ---');
  const testItems = [
    {
      id: 'rev_test_piseth',
      khmerText: 'សួស្តីបងប្អូនទាំងអស់គ្នា សូមស្វាគមន៍មកកាន់ប្រព័ន្ធ Dubber AI',
      voice: 'Piseth (Male)'
    },
    {
      id: 'rev_test_sreymom',
      khmerText: 'នាងខ្ញុំសូមជម្រាបសួរ និងសូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅ',
      voice: 'Sreymom (Female)'
    }
  ];

  const ttsResponse = await ttsService.generateVoices(testItems);
  assert(ttsResponse.success === true, 'generateVoices response success is true');
  assert(Array.isArray(ttsResponse.results) && ttsResponse.results.length === 2, `generateVoices returned 2 voice results`);

  for (const res of ttsResponse.results) {
    assert(res.success === true, `Item ${res.id} generated with success: true`);
    assert(res.duration > 0, `Item ${res.id} has duration > 0 (${res.duration}s)`);
    const filePath = path.join(__dirname, '../storage/voices', res.filename);
    assert(fs.existsSync(filePath), `File ${res.filename} exists in storage/voices/`);
    const stats = fs.statSync(filePath);
    assert(stats.size > 2000, `Audio file has valid non-empty size (${stats.size} bytes)`);
  }

  // --- 4. LIVE HTTP API & STORAGE SERVING TEST ---
  console.log('\n--- 4. TESTING LIVE HTTP API & STORAGE ROUTE ---');
  const httpPayload = JSON.stringify({
    items: [
      {
        id: 'rev_http_test_01',
        khmerText: 'តេស្តសាកល្បងប្រព័ន្ធបញ្ជូនសំឡេងតាម HTTP API',
        voice: 'Piseth (Male)'
      }
    ]
  });

  await new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/generate-voice',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(httpPayload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        assert(res.statusCode === 200, `POST /api/generate-voice returned HTTP ${res.statusCode}`);
        const parsed = JSON.parse(body);
        assert(parsed.success === true, 'Response JSON success is true');
        assert(parsed.data[0].audioUrl.startsWith('/storage/voices/'), `Audio URL starts with /storage/voices/: ${parsed.data[0].audioUrl}`);

        // Now test GET audio file
        http.get({
          hostname: 'localhost',
          port: 5000,
          path: parsed.data[0].audioUrl
        }, (audioRes) => {
          assert(audioRes.statusCode === 200, `GET ${parsed.data[0].audioUrl} returned HTTP 200 OK`);
          assert(audioRes.headers['content-type'].includes('audio'), `GET returned Content-Type audio: ${audioRes.headers['content-type']}`);
          resolve();
        });
      });
    });

    req.on('error', (e) => {
      console.error('HTTP Request failed:', e.message);
      assert(false, `HTTP request succeeded: ${e.message}`);
      resolve();
    });

    req.write(httpPayload);
    req.end();
  });

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

runReviewTests().catch(err => {
  console.error('Test run failed with unexpected error:', err);
  process.exit(1);
});
