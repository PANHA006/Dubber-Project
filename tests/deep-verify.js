const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('======================================================');
console.log('   🔍 DEEP CODE REVIEW & INTEGRITY AUDIT');
console.log('======================================================\n');

console.log('--- 1. SYNTAX VERIFICATION ON ALL FILES ---');
const files = [
  'public/js/audio-extractor.js',
  'public/js/logger.js',
  'public/js/main.js',
  'public/js/state.js',
  'public/js/subtitles.js',
  'public/js/timeline.js',
  'public/js/video-player.js',
  'src/server.js',
  'src/app.js',
  'src/routes/api.routes.js',
  'src/controllers/dubber.controller.js',
  'src/services/gemini.service.js',
  'src/services/whisper.service.js',
  'src/services/dubber.service.js',
  'src/utils/terminal-logger.js',
  'tests/e2e-api.test.js'
];

let syntaxErrors = 0;
for (const file of files) {
  try {
    execSync('node --check "' + file + '"');
    console.log('  ✅ [OK] Syntax check passed:', file);
  } catch (err) {
    console.error('  ❌ [FAIL] Syntax error in:', file, err.message);
    syntaxErrors++;
  }
}

console.log('\n--- 2. DOM ELEMENT ID BINDING VERIFICATION ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

const idRegex = /document\.getElementById\((['"])(.*?)\1\)/g;
const idsFoundInJs = new Set();

for (const file of files.filter(f => f.startsWith('public/js/'))) {
  const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  let match;
  while ((match = idRegex.exec(content)) !== null) {
    idsFoundInJs.add(match[2]);
  }
}

let missingIds = 0;
for (const id of Array.from(idsFoundInJs).sort()) {
  const hasId = indexHtml.includes('id="' + id + '"') || indexHtml.includes("id='" + id + "'");
  if (!hasId) {
    console.warn('  ⚠️ [MISSING ID]:', id);
    missingIds++;
  } else {
    console.log('  ✅ [BOUND ID]: #' + id);
  }
}

console.log('\nTotal DOM IDs checked:', idsFoundInJs.size, '| Missing IDs:', missingIds);

console.log('\n--- 3. LIVE ENDPOINTS VERIFICATION ---');
async function testLiveServer() {
  const endpoints = [
    { path: '/api/health', method: 'GET', expectStatus: 200 },
    { path: '/api/status', method: 'GET', expectStatus: 200 },
    { path: '/index.html', method: 'GET', expectStatus: 200 },
    { path: '/js/main.js', method: 'GET', expectStatus: 200 },
    { path: '/js/audio-extractor.js', method: 'GET', expectStatus: 200 },
    { path: '/js/logger.js', method: 'GET', expectStatus: 200 },
    { path: '/js/subtitles.js', method: 'GET', expectStatus: 200 },
    { path: '/js/video-player.js', method: 'GET', expectStatus: 200 },
    { path: '/css/output.css', method: 'GET', expectStatus: 200 },
    { path: '/api/transcribe', method: 'POST', expectStatus: 400 },
    { path: '/api/translate', method: 'POST', expectStatus: 400 },
    { path: '/api/terminal-log', method: 'POST', expectStatus: 200, body: JSON.stringify({ category: 'AUDIT', message: 'Live audit ping' }) }
  ];

  let endpointFailures = 0;
  for (const ep of endpoints) {
    try {
      const opts = { method: ep.method };
      if (ep.body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = ep.body;
      }
      const res = await fetch('http://localhost:5000' + ep.path, opts);
      if (res.status === ep.expectStatus) {
        console.log(`  ✅ [OK] ${ep.method} ${ep.path} -> ${res.status}`);
      } else {
        console.error(`  ❌ [FAIL] ${ep.method} ${ep.path} -> Expected ${ep.expectStatus}, got ${res.status}`);
        endpointFailures++;
      }
    } catch (err) {
      console.error(`  ❌ [ERROR] ${ep.method} ${ep.path} -> ${err.message}`);
      endpointFailures++;
    }
  }

  console.log('\n======================================================');
  console.log(`  Syntax Errors     : ${syntaxErrors}`);
  console.log(`  Missing DOM IDs   : ${missingIds}`);
  console.log(`  Endpoint Failures : ${endpointFailures}`);
  console.log('======================================================');

  if (syntaxErrors === 0 && missingIds === 0 && endpointFailures === 0) {
    console.log('🎉 ZERO ERRORS, ZERO MISTAKES! SYSTEM 100% HEALTHY.\n');
  } else {
    console.error('⚠️ Review issues above.\n');
  }
}

testLiveServer();
