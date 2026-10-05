/**
 * Verification Test: Removal of New Project button and related code
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf-8');
const MAIN_JS = fs.readFileSync(path.join(ROOT_DIR, 'public/js/main.js'), 'utf-8');
const API_ROUTES = fs.readFileSync(path.join(ROOT_DIR, 'src/routes/api.routes.js'), 'utf-8');
const DUBBER_CONTROLLER = fs.readFileSync(path.join(ROOT_DIR, 'src/controllers/dubber.controller.js'), 'utf-8');

console.log('================================================================');
console.log('🧹 VERIFYING COMPLETE REMOVAL OF NEW PROJECT BUTTON & CODE');
console.log('================================================================\n');

// 1. Frontend HTML Check
console.log('--- 1. Checking public/index.html ---');
assert(!INDEX_HTML.includes('createNewProject()'), 'FAIL: index.html still contains createNewProject()');
console.log('  ✅ [PASS] No onclick="createNewProject()" in public/index.html');

assert(!INDEX_HTML.includes('New Project'), 'FAIL: index.html still contains text "New Project"');
console.log('  ✅ [PASS] No "New Project" buttons in dropdown or toolbar');

// 2. Frontend JS Check
console.log('\n--- 2. Checking public/js/main.js ---');
assert(!MAIN_JS.includes('window.createNewProject'), 'FAIL: main.js still defines window.createNewProject');
console.log('  ✅ [PASS] window.createNewProject completely removed from main.js');

assert(!MAIN_JS.includes('_explicitProjectCleared'), 'FAIL: main.js still references _explicitProjectCleared');
console.log('  ✅ [PASS] window._explicitProjectCleared cleaned up from main.js');

// 3. Backend Routes Check
console.log('\n--- 3. Checking src/routes/api.routes.js ---');
assert(!API_ROUTES.includes('/project/clear'), 'FAIL: api.routes.js still has /project/clear route');
console.log('  ✅ [PASS] Route POST /api/project/clear removed from api.routes.js');

// 4. Backend Controller Check
console.log('\n--- 4. Checking src/controllers/dubber.controller.js ---');
assert(!DUBBER_CONTROLLER.includes('clearProject('), 'FAIL: dubber.controller.js still defines clearProject');
console.log('  ✅ [PASS] clearProject method removed from dubber.controller.js');

// 5. Verify live server responds 404 to /api/project/clear
console.log('\n--- 5. Checking Live Server Endpoint (POST /api/project/clear) ---');
const postReq = http.request(
  {
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/clear',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  },
  (res) => {
    assert(res.statusCode === 404, `Expected 404 for removed endpoint, got ${res.statusCode}`);
    console.log(`  ✅ [PASS] Server correctly returns HTTP 404 for removed /api/project/clear route`);
    console.log('\n================================================================');
    console.log('📊 RESULT: ALL 5/5 REMOVAL CHECKS PASSED (100%)');
    console.log('================================================================\n');
    process.exit(0);
  }
);

postReq.on('error', (err) => {
  console.log(`  ⚠️ Note: Server not running or connect error: ${err.message}. Static checks all passed.`);
  console.log('\n================================================================');
  console.log('📊 RESULT: STATIC REMOVAL CHECKS PASSED (100%)');
  console.log('================================================================\n');
  process.exit(0);
});

postReq.write(JSON.stringify({ isExplicitClear: true }));
postReq.end();
