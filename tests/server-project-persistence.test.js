/**
 * Automated Test Suite for:
 * 1. Server-Side Project Persistence (autosave_project.json)
 * 2. API Endpoints: POST /api/project/save, GET /api/project/load, POST /api/project/clear
 * 3. Frontend UI components & DOM (Auto-save badge, New Project button)
 * 4. Page refresh recovery simulation
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

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }));
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runPersistenceTests() {
  console.log('\n================================================================');
  console.log('   💾 TEST SUITE: SERVER-SIDE PROJECT PERSISTENCE (AUTOSAVE)    ');
  console.log('================================================================\n');

  // --- 1. AUDITING FRONTEND DOM & CODE ARCHITECTURE ---
  console.log('--- 1. AUDITING FRONTEND DOM & LOGIC ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  assert(indexHtml.includes('id="autosave-badge"'), 'index.html contains #autosave-badge');
  assert(indexHtml.includes('id="autosave-text"'), 'index.html contains #autosave-text');
  assert(!indexHtml.includes('createNewProject()'), 'index.html has New Project buttons removed');
  assert(mainJs.includes('window.triggerProjectAutoSave'), 'main.js exports window.triggerProjectAutoSave');
  assert(mainJs.includes('window.loadSavedProject'), 'main.js exports window.loadSavedProject');
  assert(!mainJs.includes('window.createNewProject'), 'main.js cleanly removed window.createNewProject');
  assert(mainJs.includes("state.on('subtitlesChanged'"), 'main.js hooks subtitlesChanged to auto-save');

  // --- 2. BACKEND API: SAVE PROJECT ---
  console.log('\n--- 2. TESTING POST /api/project/save ---');
  const projectFilePath = path.join(__dirname, '../storage/projects/autosave_project.json');
  let originalProjectBackup = null;
  if (fs.existsSync(projectFilePath)) {
    originalProjectBackup = fs.readFileSync(projectFilePath, 'utf-8');
  }

  const testProjectData = {
    video: {
      name: 'sample_lesson.mp4',
      duration: 125.5
    },
    subtitles: [
      {
        id: 'sub-save-01',
        start: '00:00:02,000',
        end: '00:00:06,000',
        startSec: 2,
        endSec: 6,
        originalText: 'Welcome to our AI Dubber project',
        khmerText: 'សូមស្វាគមន៍មកកាន់ប្រព័ន្ធ AI Dubber របស់យើង',
        voice: 'Piseth (Male)',
        status: 'Ready',
        audioUrl: '/storage/voices/voice_sub_save_01.mp3',
        audioDuration: 3.8
      }
    ],
    dubbingSettings: {
      vadThreshold: 0.15,
      maxMergeLimit: 4
    }
  };

  const saveRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, testProjectData);

  assert(saveRes.statusCode === 200, `POST /api/project/save returned HTTP ${saveRes.statusCode}`);
  assert(saveRes.body.success === true, 'Save response success is true');
  assert(fs.existsSync(projectFilePath), 'autosave_project.json was physically created in storage/projects/');

  const savedOnDisk = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
  assert(savedOnDisk.subtitles.length === 1, 'Saved file contains 1 subtitle item');
  assert(savedOnDisk.subtitles[0].khmerText === testProjectData.subtitles[0].khmerText, 'Khmer text saved accurately');
  assert(savedOnDisk.video.name === 'sample_lesson.mp4', 'Video metadata saved accurately');

  // --- 3. BACKEND API: LOAD PROJECT ---
  console.log('\n--- 3. TESTING GET /api/project/load ---');
  const loadRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/load',
    method: 'GET'
  });

  assert(loadRes.statusCode === 200, `GET /api/project/load returned HTTP ${loadRes.statusCode}`);
  assert(loadRes.body.success === true, 'Load response success is true');
  assert(loadRes.body.data !== null, 'Loaded project data is not null');
  assert(loadRes.body.data.subtitles[0].id === 'sub-save-01', 'Loaded subtitle ID matches');
  assert(loadRes.body.data.subtitles[0].audioUrl === '/storage/voices/voice_sub_save_01.mp3', 'Audio URL preserved across sessions');

  // --- 4. BACKEND API: REMOVAL OF /api/project/clear ---
  console.log('\n--- 4. TESTING REMOVAL OF POST /api/project/clear ---');
  const clearRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/clear',
    method: 'POST'
  });

  assert(clearRes.statusCode === 404, `POST /api/project/clear returns HTTP 404 Not Found (Got ${clearRes.statusCode})`);

  // Restore user's original project if one existed before test
  if (originalProjectBackup) {
    fs.writeFileSync(projectFilePath, originalProjectBackup, 'utf-8');
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

runPersistenceTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
