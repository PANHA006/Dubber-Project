const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ttsService = require('../src/services/tts.service');
const app = require('../src/app');

async function runVoiceGenerationTests() {
  console.log('================================================================');
  console.log('   🎙️ TEST SUITE: KHMER EDGE TTS, VOICE STORAGE & SOUND UI     ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     ↳ ${e.message}`);
    }
  }

  // --- 1. AUDITING UI DOM FOR SOUND HEADER & GENERATE VOICE BUTTON ---
  console.log('--- 1. AUDITING UI DOM (index.html & subtitles.js) ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  test('Table Header contains SOUND with volume-2 icon', () => {
    assert(indexHtml.includes('<span>SOUND</span>'), 'Table header has SOUND text');
    assert(indexHtml.includes('data-lucide="volume-2"'), 'Header has volume-2 icon');
    assert(!indexHtml.includes('<th class="py-2.5 px-3 w-24 text-center">STATUS</th>'), 'Old STATUS header removed');
  });

  test('Toolbar contains #btn-generate-voice button with generateAllVoice()', () => {
    assert(indexHtml.includes('id="btn-generate-voice"'), 'Has #btn-generate-voice');
    assert(indexHtml.includes('onclick="generateAllVoice()"'), 'Has onclick="generateAllVoice()"');
    assert(indexHtml.includes('id="generate-voice-text">Generate Voice</span>'), 'Button text is Generate Voice');
  });

  test('subtitles.js defines window.playVoice and renders gray disabled 🔊 when pending', () => {
    assert(subtitlesJs.includes('window.playVoice = function'), 'window.playVoice function defined');
    assert(subtitlesJs.includes('cursor-not-allowed select-none'), 'Renders disabled state when pending');
    assert(subtitlesJs.includes('sub-voice-play-btn'), 'Renders playable button when ready');
  });

  test('main.js defines window.generateAllVoice to call /api/generate-voice', () => {
    assert(mainJs.includes('window.generateAllVoice = async function'), 'generateAllVoice defined in main.js');
    assert(mainJs.includes('/api/generate-voice'), 'Calls /api/generate-voice');
  });

  // --- 2. AUDITING TTS SERVICE & PYTHON WORKER GENERATION ---
  console.log('\n--- 2. AUDITING TTS SERVICE & EDGE TTS WORKER ---');

  const testItems = [
    { id: 'unit_test_piseth', khmerText: 'សួស្តីបងប្អូន ខ្ញុំបាទឈ្មោះ ពិសិដ្ឋ', voice: 'Piseth (Male)' },
    { id: 'unit_test_sreymom', khmerText: 'សួស្តីចា៎ នាងខ្ញុំឈ្មោះ ស្រីមុំ', voice: 'Sreymom (Female)' }
  ];

  try {
    const ttsResult = await ttsService.generateVoices(testItems);
    total++;
    assert(ttsResult.success, 'TTS generation should return success: true');
    assert.strictEqual(ttsResult.results.length, 2, 'Should generate exactly 2 files');
    console.log('  ✅ PASS: ttsService.generateVoices generated 2 voice files');
    passed++;

    // Check physical file existence and size
    for (const res of ttsResult.results) {
      total++;
      const filePath = path.join(__dirname, '..', res.audioUrl.replace(/^\//, ''));
      assert(fs.existsSync(filePath), `File ${filePath} must exist in storage`);
      const stat = fs.statSync(filePath);
      assert(stat.size > 1000, `File size should be > 1000 bytes (got ${stat.size} bytes)`);
      assert(res.duration > 0.5, `Duration should be > 0.5s (got ${res.duration}s)`);
      console.log(`  ✅ PASS: Verified audio file ${res.filename} (${stat.size} bytes, ${res.duration}s)`);
      passed++;
    }
  } catch (err) {
    total += 3;
    console.error('  ❌ FAIL: TTS Service generation failed:', err.message);
  }

  // --- 3. AUDITING LIVE API & STATIC FILE SERVING ---
  console.log('\n--- 3. AUDITING LIVE HTTP ENDPOINTS ---');

  const TEST_PORT = 5199;
  const server = app.listen(TEST_PORT, async () => {
    try {
      // Test POST /api/generate-voice
      const postPayload = JSON.stringify({
        items: [
          { id: 'api_test_01', khmerText: 'ចាំខ្ញុំនៅចំណតក្រោមដី', voice: 'Piseth (Male)' }
        ]
      });

      const apiRes = await new Promise((resolve, reject) => {
        const req = http.request({
          host: 'localhost',
          port: TEST_PORT,
          path: '/api/generate-voice',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postPayload)
          }
        }, (res) => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
        });
        req.on('error', reject);
        req.write(postPayload);
        req.end();
      });

      total++;
      assert.strictEqual(apiRes.status, 200, 'POST /api/generate-voice should return 200');
      assert(apiRes.data.success, 'Response success should be true');
      assert.strictEqual(apiRes.data.count, 1, 'Count should be 1');
      console.log('  ✅ PASS: POST /api/generate-voice -> HTTP 200 OK');
      passed++;

      // Test GET static file
      const generatedUrl = apiRes.data.data[0].audioUrl;
      const staticRes = await new Promise((resolve, reject) => {
        const req = http.get({
          host: 'localhost',
          port: TEST_PORT,
          path: generatedUrl
        }, (res) => {
          resolve({ status: res.statusCode, contentType: res.headers['content-type'] });
        });
        req.on('error', reject);
      });

      total++;
      assert.strictEqual(staticRes.status, 200, `GET ${generatedUrl} should return 200`);
      assert(staticRes.contentType && staticRes.contentType.includes('audio'), 'Content-Type should be audio');
      console.log(`  ✅ PASS: GET ${generatedUrl} -> HTTP 200 (${staticRes.contentType})`);
      passed++;

      console.log('\n================================================================');
      console.log(`📊 FINAL RESULT: ${passed}/${total} CHECKS PASSED (${Math.round((passed/total)*100)}%)`);
      console.log('================================================================\n');

      server.close(() => {
        if (passed !== total) process.exit(1);
        process.exit(0);
      });

    } catch (err) {
      console.error('\n❌ HTTP Audit Failed:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

runVoiceGenerationTests().catch(e => {
  console.error(e);
  process.exit(1);
});
