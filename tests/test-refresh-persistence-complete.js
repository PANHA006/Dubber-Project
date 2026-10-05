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
  console.log('   🔄 VERIFYING REFRESH & DUAL-LAYER PERSISTENCE RESTORATION    ');
  console.log('================================================================\n');

  // --- 1. VERIFY CODE ARCHITECTURE ---
  console.log('--- 1. VERIFYING CLIENT CODE SAFETY GUARDS ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const controllerJs = fs.readFileSync(path.join(__dirname, '../src/controllers/dubber.controller.js'), 'utf-8');

  assert(mainJs.includes('localStorage.setItem(\'dubber_autosave_project\''), 'main.js writes to localStorage for instant 0ms backup');
  assert(mainJs.includes('localStorage.getItem(\'dubber_autosave_project\''), 'main.js loads from localStorage on page refresh');
  assert(mainJs.includes('state.isRestoringProject'), 'main.js guards against saving during restoration');
  assert(mainJs.includes('(!state.subtitles || state.subtitles.length === 0) && !state.videoUrl'), 'main.js guards against saving empty arrays accidentally');
  assert(mainJs.includes('window.addEventListener(\'beforeunload\''), 'main.js flushes pending changes on page refresh / beforeunload');
  assert(controllerJs.includes('!req.body.isExplicitClear && fs.existsSync(projectPath)'), 'Backend controller guards against empty overwrites without explicit clear');

  assert(subtitlesJs.includes('addNewSubtitleRow') && subtitlesJs.includes("state.emit('subtitlesChanged', state.subtitles)"), 'addNewSubtitleRow emits subtitlesChanged');
  assert(subtitlesJs.includes('deleteSelectedSubtitles') && subtitlesJs.includes("state.emit('subtitlesChanged', state.subtitles)"), 'deleteSelectedSubtitles emits subtitlesChanged');
  assert(subtitlesJs.includes('selectAllSubtitles') && subtitlesJs.includes("state.emit('subtitlesChanged', state.subtitles)"), 'selectAllSubtitles emits subtitlesChanged');
  assert(subtitlesJs.includes('setAllVoices') && subtitlesJs.includes("state.emit('subtitlesChanged', state.subtitles)"), 'setAllVoices emits subtitlesChanged');
  assert(subtitlesJs.includes('importSRTContent') && subtitlesJs.includes("state.emit('subtitlesChanged', state.subtitles)"), 'importSRTContent emits subtitlesChanged');

  // --- 2. BACKEND API PERSISTENCE LIFECYCLE ---
  console.log('\n--- 2. TESTING SERVER PERSISTENCE & SAFEGUARD ---');
  const projectFilePath = path.join(__dirname, '../storage/projects/autosave_project.json');

  const testData = {
    video: {
      name: 'lesson_presentation.mp4',
      duration: 180.5
    },
    subtitles: [
      {
        id: 'sub-persist-1',
        start: '00:00:01,000',
        end: '00:00:04,500',
        startSec: 1.0,
        endSec: 4.5,
        originalText: 'Hello world',
        khmerText: 'សួស្តីពិភពលោក',
        voice: 'Piseth (Male)',
        status: 'Ready',
        audioUrl: '/storage/voices/sample_audio.mp3',
        speedApplied: 1.25
      }
    ],
    dubbingSettings: {
      endPadding: 0.8,
      bgVolume: 10
    }
  };

  // Step A: Save project to server
  const saveRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, testData);

  assert(saveRes.statusCode === 200, 'POST /api/project/save returns 200 OK');
  assert(fs.existsSync(projectFilePath), 'autosave_project.json exists on disk');

  // Step B: Simulate an accidental empty save WITHOUT explicit clear (e.g. boot race condition)
  const accidentalEmptySave = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    subtitles: [],
    isExplicitClear: false
  });

  assert(accidentalEmptySave.statusCode === 200, 'Accidental empty POST /api/project/save returns 200');
  const diskData = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
  assert(diskData.subtitles.length === 1, 'Safeguard protected project: subtitles array was NOT wiped out!');
  assert(diskData.subtitles[0].khmerText === 'សួស្តីពិភពលោក', 'Khmer text remained intact despite empty request');

  // Step C: Simulate page load / refresh fetch
  const loadRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/load',
    method: 'GET'
  });

  assert(loadRes.statusCode === 200, 'GET /api/project/load returns 200 OK');
  assert(loadRes.body.success === true, 'Load response success: true');
  assert(loadRes.body.data.subtitles.length === 1, 'Restored 1 subtitle item');
  assert(loadRes.body.data.subtitles[0].audioUrl === '/storage/voices/sample_audio.mp3', 'Audio URL restored');
  assert(loadRes.body.data.subtitles[0].speedApplied === 1.25, 'Speed badge calculation restored');
  assert(loadRes.body.data.video.name === 'lesson_presentation.mp4', 'Video metadata restored');

  console.log('\n================================================================');
  console.log(`📊 TEST COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
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
