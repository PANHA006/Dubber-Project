/**
 * Automated Test Suite for:
 * 1. Re-Generate Voice button in index.html
 * 2. Auto-checking and Amber/Yellow sound button on text edit
 * 3. Targeted Re-generation (only checked rows)
 * 4. Automatic deletion of old audio files in storage/voices/
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

async function runTests() {
  console.log('\n================================================================');
  console.log('   🔄 TEST SUITE: RE-GENERATE VOICE, AUTO-CHECK & OLD AUDIO DELETION');
  console.log('================================================================\n');

  // --- 1. DOM & SCRIPT AUDIT ---
  console.log('--- 1. AUDITING FRONTEND DOM & LOGIC ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  assert(indexHtml.includes('id="btn-regenerate-voice"') && indexHtml.includes('reGenerateSelectedVoices()'), 'index.html contains #btn-regenerate-voice linked to reGenerateSelectedVoices()');
  assert(indexHtml.includes('Re-Generate Voice'), 'Button text includes "Re-Generate Voice"');
  assert(subtitlesJs.includes('isModified') && subtitlesJs.includes('text-amber-400'), 'subtitles.js renders amber/yellow sound button for modified rows');
  assert(subtitlesJs.includes('sub.selected = true') && subtitlesJs.includes("sub.status = 'Modified'"), 'subtitles.js auto-checks row and sets Modified status on text input');
  assert(mainJs.includes('window.reGenerateSelectedVoices = async function'), 'main.js defines window.reGenerateSelectedVoices');
  assert(mainJs.includes('s.selected') && mainJs.includes('oldAudioUrl'), 'main.js filters only checked rows and includes oldAudioUrl in payload');

  // --- 2. OLD AUDIO DELETION AUDIT VIA TTS SERVICE ---
  console.log('\n--- 2. TESTING AUTOMATIC DELETION OF OLD AUDIO FILES ---');
  const ttsService = require('../src/services/tts.service.js');
  const storageDir = path.join(__dirname, '../storage/voices');

  // Create a distinct old audio file
  const oldFilename = `old_obsolete_voice_${Date.now()}.mp3`;
  const oldFilePath = path.join(storageDir, oldFilename);
  fs.writeFileSync(oldFilePath, Buffer.from('FAKE_OLD_AUDIO_CONTENT_FOR_DELETION_TEST'));
  assert(fs.existsSync(oldFilePath), `Created test old file: ${oldFilename}`);

  // Generate new voice while referencing the old file
  const testSubId = `test_regen_${Date.now()}`;
  const ttsResponse = await ttsService.generateVoices([
    {
      id: testSubId,
      khmerText: 'តេស្តសាកល្បងការបង្កើតសំឡេងថ្មី និងការលុបសំឡេងចាស់',
      voice: 'Piseth (Male)',
      oldFilename: oldFilename
    }
  ]);

  assert(ttsResponse.success === true, 'ttsService.generateVoices succeeded');
  assert(ttsResponse.results && ttsResponse.results.length === 1, 'Received 1 generation result');

  const newRes = ttsResponse.results[0];
  const newFilePath = path.join(storageDir, newRes.filename);
  assert(fs.existsSync(newFilePath), `New audio file exists: ${newRes.filename}`);
  assert(!fs.existsSync(oldFilePath), `Old audio file ${oldFilename} was deleted automatically from storage/voices/`);

  // Clean up the new test file
  try { if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath); } catch (_) {}

  // --- 3. LIVE HTTP RE-GENERATE ENDPOINT TEST ---
  console.log('\n--- 3. TESTING LIVE HTTP API WITH OLD FILE DELETION ---');
  const httpOldFilename = `http_old_obsolete_${Date.now()}.mp3`;
  const httpOldFilePath = path.join(storageDir, httpOldFilename);
  fs.writeFileSync(httpOldFilePath, Buffer.from('FAKE_HTTP_OLD_AUDIO_CONTENT'));
  assert(fs.existsSync(httpOldFilePath), `Created test old HTTP audio file: ${httpOldFilename}`);

  const httpPayload = JSON.stringify({
    items: [
      {
        id: `http_regen_${Date.now()}`,
        khmerText: 'សាកល្បងតាម HTTP API សម្រាប់ Re-Generate',
        voice: 'Sreymom (Female)',
        oldAudioUrl: `/storage/voices/${httpOldFilename}`
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
        assert(res.statusCode === 200, `POST /api/generate-voice returned HTTP 200`);
        const parsed = JSON.parse(body);
        assert(parsed.success === true, 'API response success is true');
        assert(!fs.existsSync(httpOldFilePath), `Old HTTP audio file ${httpOldFilename} was deleted successfully via API!`);

        if (parsed.data && parsed.data[0]) {
          const generatedPath = path.join(storageDir, parsed.data[0].filename);
          try { if (fs.existsSync(generatedPath)) fs.unlinkSync(generatedPath); } catch (_) {}
        }
        resolve();
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

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
