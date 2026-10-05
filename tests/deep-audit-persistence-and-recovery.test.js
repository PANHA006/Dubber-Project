/**
 * Deep Audit & Comprehensive End-to-End Test Suite for:
 * 1. Full Project Auto-Save & Refresh Recovery Lifecycle
 * 2. Multi-row Subtitle State Persistence (Pending, Ready, Modified)
 * 3. Physical Storage & Serving of Voices (/storage/voices/*.mp3) across reloads
 * 4. Project Clearing & New Project Workspace Reset
 * 5. UI Elements & DOM Verification
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

function requestHttp(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) { parsed = body; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('   🔍 DEEP AUDIT: FULL PROJECT PERSISTENCE & REFRESH RECOVERY   ');
  console.log('================================================================\n');

  const projectFilePath = path.join(__dirname, '../storage/projects/autosave_project.json');
  let originalProjectBackup = null;
  if (fs.existsSync(projectFilePath)) {
    originalProjectBackup = fs.readFileSync(projectFilePath, 'utf-8');
  }
  const storageVoicesDir = path.join(__dirname, '../storage/voices');

  // --- 1. AUDITING FRONTEND DOM & CODE ARCHITECTURE ---
  console.log('--- 1. AUDITING DOM ELEMENTS & UI INTEGRATION ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  assert(indexHtml.includes('id="autosave-badge"'), 'index.html contains #autosave-badge element');
  assert(indexHtml.includes('id="autosave-icon"'), 'index.html contains #autosave-icon element');
  assert(indexHtml.includes('id="autosave-text"'), 'index.html contains #autosave-text element');
  assert(!indexHtml.includes('createNewProject()'), 'index.html has New Project buttons removed');
  assert(mainJs.includes('window.triggerProjectAutoSave'), 'main.js defines window.triggerProjectAutoSave');
  assert(mainJs.includes('window.loadSavedProject'), 'main.js defines window.loadSavedProject');
  assert(!mainJs.includes('window.createNewProject'), 'main.js cleanly removed window.createNewProject');
  assert(mainJs.includes("state.on('subtitlesChanged'"), 'main.js auto-saves on subtitlesChanged');
  assert(mainJs.includes("state.on('dubbingSettingsChanged'"), 'main.js auto-saves on dubbingSettingsChanged');

  // --- 2. GENERATING REAL SPEECH AUDIO FOR PERSISTENCE TEST ---
  console.log('\n--- 2. CREATING REAL SPEECH AUDIO FILES FOR PERSISTENCE ---');
  const ttsService = require('../src/services/tts.service.js');
  const ttsResponse = await ttsService.generateVoices([
    {
      id: 'audit_persist_sub_01',
      khmerText: 'មេរៀនទីមួយ៖ ការស្វាគមន៍ និងការណែនាំខ្លួន',
      voice: 'Piseth (Male)'
    },
    {
      id: 'audit_persist_sub_02',
      khmerText: 'នាងខ្ញុំសូមអរគុណយ៉ាងជ្រាលជ្រៅ',
      voice: 'Sreymom (Female)'
    }
  ]);

  assert(ttsResponse.success === true && ttsResponse.results.length === 2, 'Generated 2 real speech audio files');
  const audio1 = ttsResponse.results[0];
  const audio2 = ttsResponse.results[1];
  assert(fs.existsSync(path.join(storageVoicesDir, audio1.filename)), `Audio file 1 exists: ${audio1.filename}`);
  assert(fs.existsSync(path.join(storageVoicesDir, audio2.filename)), `Audio file 2 exists: ${audio2.filename}`);

  // --- 3. AUTO-SAVING PROJECT WITH MULTIPLE STATES (Ready, Modified, Pending) ---
  console.log('\n--- 3. TESTING AUTO-SAVE WITH MIXED STATES (Ready, Modified, Pending) ---');
  const richProjectPayload = {
    video: {
      name: 'khmer_tutorial_full.mp4',
      duration: 360.5
    },
    subtitles: [
      {
        id: 'sub-01',
        start: '00:00:01,000',
        end: '00:00:04,500',
        startSec: 1.0,
        endSec: 4.5,
        originalText: 'Lesson one: Introduction',
        khmerText: 'មេរៀនទីមួយ៖ ការស្វាគមន៍ និងការណែនាំខ្លួន',
        voice: 'Piseth (Male)',
        status: 'Ready',
        audioUrl: audio1.audioUrl,
        audioDuration: audio1.duration,
        selected: false
      },
      {
        id: 'sub-02',
        start: '00:00:05,000',
        end: '00:00:09,200',
        startSec: 5.0,
        endSec: 9.2,
        originalText: 'Thank you very much',
        khmerText: 'នាងខ្ញុំសូមអរគុណយ៉ាងជ្រាលជ្រៅ (ទើបកែ)',
        voice: 'Sreymom (Female)',
        status: 'Modified',
        needsRegenerate: true,
        oldAudioUrl: audio2.audioUrl,
        audioUrl: audio2.audioUrl,
        audioDuration: audio2.duration,
        selected: true
      },
      {
        id: 'sub-03',
        start: '00:00:10,000',
        end: '00:00:14,000',
        startSec: 10.0,
        endSec: 14.0,
        originalText: 'See you next time',
        khmerText: 'ជួបគ្នានៅវគ្គបន្ទាប់',
        voice: 'Piseth (Male)',
        status: 'Pending',
        audioUrl: null,
        selected: false
      }
    ],
    dubbingSettings: {
      vadThreshold: 0.20,
      maxMergeLimit: 5,
      bgVolume: 12,
      removeSpokenVoice: true
    }
  };

  const saveRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, richProjectPayload);

  assert(saveRes.statusCode === 200, `POST /api/project/save returned HTTP 200`);
  assert(saveRes.body.success === true, 'Project saved successfully');
  assert(fs.existsSync(projectFilePath), 'autosave_project.json is physically present on disk');

  // Verify file content on disk
  const diskData = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
  assert(diskData.subtitles.length === 3, 'autosave_project.json contains all 3 subtitle entries');
  assert(diskData.subtitles[1].status === 'Modified' && diskData.subtitles[1].selected === true, 'Modified & checked state preserved');
  assert(diskData.dubbingSettings.vadThreshold === 0.20, 'Dubbing settings preserved');

  // --- 4. SIMULATING BROWSER REFRESH (F5) AND STATE RECOVERY ---
  console.log('\n--- 4. SIMULATING REFRESH RECOVERY VIA GET /api/project/load ---');
  const loadRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/load',
    method: 'GET'
  });

  assert(loadRes.statusCode === 200, `GET /api/project/load returned HTTP 200`);
  assert(loadRes.body.success === true, 'Load response success: true');
  const restored = loadRes.body.data;
  assert(restored !== null, 'Restored project data is not null');
  assert(restored.video.name === 'khmer_tutorial_full.mp4', 'Restored video name matches');
  assert(restored.subtitles.length === 3, 'Restored all 3 subtitle items');

  // Verify sound accessibility on restored project
  const restoredAudioUrl = restored.subtitles[0].audioUrl;
  assert(restoredAudioUrl.startsWith('/storage/voices/'), `Restored audio URL is valid: ${restoredAudioUrl}`);

  const audioCheck = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: restoredAudioUrl,
    method: 'GET'
  });
  assert(audioCheck.statusCode === 200, `GET ${restoredAudioUrl} returned HTTP 200 OK`);
  assert(audioCheck.headers['content-type'].includes('audio/mpeg'), 'Audio content-type is audio/mpeg');

  // --- 5. TESTING NEW PROJECT CLEAR WORKSPACE WORKFLOW ---
  console.log('\n--- 5. TESTING REMOVAL OF POST /api/project/clear ---');
  const clearRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/clear',
    method: 'POST'
  });

  assert(clearRes.statusCode === 404, `POST /api/project/clear returns HTTP 404 Not Found (Got ${clearRes.statusCode})`);

  // Clean up test audio files
  try { fs.unlinkSync(path.join(storageVoicesDir, audio1.filename)); } catch (_) {}
  try { fs.unlinkSync(path.join(storageVoicesDir, audio2.filename)); } catch (_) {}

  // Restore user's original project if one existed before test
  if (originalProjectBackup) {
    fs.writeFileSync(projectFilePath, originalProjectBackup, 'utf-8');
  }

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`📊 AUDIT RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
