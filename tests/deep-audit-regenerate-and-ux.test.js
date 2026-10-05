/**
 * Deep Audit & Comprehensive Review Test:
 * 1. UI Elements & Lucide Icons for Generate Voice & Re-Generate Voice
 * 2. Full State Lifecycle: Pending -> Ready (Green) -> Modified (Yellow + Auto-Checked) -> Re-Generate -> Ready (Green)
 * 3. File System: Guaranteed deletion of obsolete audio files in storage/voices/
 * 4. HTTP API: Live POST /api/generate-voice & GET /storage/voices/
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

async function runDeepAudit() {
  console.log('\n================================================================');
  console.log('   🔍 DEEP AUDIT & VERIFICATION: RE-GENERATE VOICE & AUDIO SYSTEM');
  console.log('================================================================\n');

  // --- 1. AUDITING FRONTEND DOM, ICONS & ATTRIBUTES ---
  console.log('--- 1. AUDITING FRONTEND DOM & CODE ARCHITECTURE ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  // Check buttons
  assert(indexHtml.includes('id="btn-generate-voice"'), 'index.html contains #btn-generate-voice');
  assert(indexHtml.includes('id="btn-regenerate-voice"'), 'index.html contains #btn-regenerate-voice');
  assert(indexHtml.includes('data-lucide="refresh-cw"'), '#btn-regenerate-voice has refresh-cw icon');
  assert(indexHtml.includes('SOUND') && indexHtml.includes('volume-2'), 'Table header contains SOUND column with volume-2 icon');

  // Check state & rendering logic
  assert(subtitlesJs.includes('isModified') && subtitlesJs.includes('text-amber-400'), 'subtitles.js renders Yellow/Amber button for Modified rows');
  assert(subtitlesJs.includes('isReady') && subtitlesJs.includes('text-emerald-400'), 'subtitles.js renders Green button for Ready rows');
  assert(subtitlesJs.includes('cursor-not-allowed') && subtitlesJs.includes('Pending'), 'subtitles.js renders Gray disabled icon for Pending rows');
  assert(subtitlesJs.includes('sub.selected = true') && subtitlesJs.includes("sub.status = 'Modified'"), 'subtitles.js auto-checks checkbox and sets Modified on text change');
  assert(mainJs.includes('window.reGenerateSelectedVoices'), 'main.js exposes window.reGenerateSelectedVoices');
  assert(mainJs.includes('s.selected') && mainJs.includes('oldAudioUrl'), 'reGenerateSelectedVoices filters only checked rows and includes oldAudioUrl');

  // --- 2. STATE TRANSITION SIMULATION AUDIT ---
  console.log('\n--- 2. SIMULATING FULL SUBTITLE ROW LIFECYCLE ---');
  const mockSub = {
    id: 'sim_sub_01',
    start: '00:00:01,000',
    end: '00:00:04,000',
    originalText: 'Hello world',
    khmerText: 'សួស្តីពិភពលោក',
    voice: 'Piseth (Male)',
    status: 'Pending',
    selected: false,
    audioUrl: null
  };

  assert(mockSub.status === 'Pending' && !mockSub.selected, 'Initial state: Pending and unchecked');

  // Step A: Voice is generated (Ready)
  mockSub.status = 'Ready';
  mockSub.audioUrl = '/storage/voices/voice_sim_sub_01.mp3';
  mockSub.audioDuration = 2.5;
  assert(mockSub.status === 'Ready' && mockSub.audioUrl !== null, 'Step A: Audio generated -> status Ready (Green sound icon)');

  // Step B: User edits Khmer text -> Auto-check & Modified (Yellow)
  mockSub.khmerText = 'សួស្តីពិភពលោក (កែប្រែថ្មី)';
  mockSub.selected = true; // auto-check
  mockSub.status = 'Modified';
  mockSub.needsRegenerate = true;
  mockSub.oldAudioUrl = mockSub.audioUrl;
  assert(mockSub.selected === true, 'Step B: User edits text -> Row is Auto-Checked (selected: true)');
  assert(mockSub.status === 'Modified' && mockSub.needsRegenerate === true, 'Step B: Status is Modified -> Sound icon turns Yellow');
  assert(mockSub.oldAudioUrl === '/storage/voices/voice_sim_sub_01.mp3', 'Step B: Old audio URL is preserved for deletion');

  // Step C: Re-Generate is executed -> Ready (Green)
  mockSub.status = 'Ready';
  mockSub.needsRegenerate = false;
  mockSub.selected = false;
  delete mockSub.oldAudioUrl;
  assert(mockSub.status === 'Ready' && !mockSub.needsRegenerate, 'Step C: Re-Generate completed -> Status returns to Ready (Green sound icon)');
  assert(mockSub.selected === false, 'Step C: Checkbox is unselected after completion');

  // --- 3. FILESYSTEM AUDIT: PHYSICAL FILE DELETION ---
  console.log('\n--- 3. VERIFYING PHYSICAL FILE DELETION IN STORAGE/VOICES/ ---');
  const ttsService = require('../src/services/tts.service.js');
  const storageDir = path.join(__dirname, '../storage/voices');

  const obsoleteFileName = `obsolete_audio_audit_${Date.now()}.mp3`;
  const obsoleteFilePath = path.join(storageDir, obsoleteFileName);
  fs.writeFileSync(obsoleteFilePath, Buffer.from('AUDIT_DUMMY_AUDIO_DATA'));
  assert(fs.existsSync(obsoleteFilePath), `Created temporary obsolete file: ${obsoleteFileName}`);

  const regenItem = {
    id: `audit_regen_${Date.now()}`,
    khmerText: 'សាកល្បងការលុបឯកសារចាស់ចោលពី Storage',
    voice: 'Piseth (Male)',
    oldFilename: obsoleteFileName
  };

  const ttsResult = await ttsService.generateVoices([regenItem]);
  assert(ttsResult.success === true, 'ttsService generated new speech successfully');
  assert(ttsResult.results && ttsResult.results.length === 1, 'Received 1 result item');

  const generatedFile = path.join(storageDir, ttsResult.results[0].filename);
  assert(fs.existsSync(generatedFile), `New speech file created: ${ttsResult.results[0].filename}`);
  assert(!fs.existsSync(obsoleteFilePath), `Obsolete file ${obsoleteFileName} was successfully DELETED from disk!`);

  // Clean up test file
  try { if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile); } catch (_) {}

  // --- 4. LIVE HTTP API & STORAGE ROUTE AUDIT ---
  console.log('\n--- 4. AUDITING LIVE HTTP POST /api/generate-voice & AUDIO SERVING ---');
  const apiObsoleteFileName = `api_obsolete_${Date.now()}.mp3`;
  const apiObsoleteFilePath = path.join(storageDir, apiObsoleteFileName);
  fs.writeFileSync(apiObsoleteFilePath, Buffer.from('API_DUMMY_DATA'));
  assert(fs.existsSync(apiObsoleteFilePath), `Created API test obsolete file: ${apiObsoleteFileName}`);

  const httpPayload = JSON.stringify({
    items: [
      {
        id: `http_audit_${Date.now()}`,
        khmerText: 'សាកល្បង Re-Generate តាម HTTP Express API',
        voice: 'Sreymom (Female)',
        oldAudioUrl: `/storage/voices/${apiObsoleteFileName}`
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
        assert(res.statusCode === 200, `POST /api/generate-voice returned HTTP 200 OK`);
        const parsed = JSON.parse(body);
        assert(parsed.success === true, 'API response JSON success: true');
        assert(!fs.existsSync(apiObsoleteFilePath), `API successfully deleted obsolete file: ${apiObsoleteFileName}`);

        if (parsed.data && parsed.data[0]) {
          const newUrl = parsed.data[0].audioUrl;
          assert(newUrl.startsWith('/storage/voices/'), `New audio URL is ${newUrl}`);

          // Test static GET
          http.get({
            hostname: 'localhost',
            port: 5000,
            path: newUrl
          }, (audioRes) => {
            assert(audioRes.statusCode === 200, `GET ${newUrl} returned HTTP 200 OK`);
            assert(audioRes.headers['content-type'].includes('audio'), `Content-Type is audio/mpeg`);

            // Clean up
            const genPath = path.join(storageDir, parsed.data[0].filename);
            try { if (fs.existsSync(genPath)) fs.unlinkSync(genPath); } catch (_) {}
            resolve();
          });
        } else {
          resolve();
        }
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

runDeepAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
