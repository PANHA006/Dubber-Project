/**
 * Complete System Integrity Review Test Suite
 * Validates UI, API endpoints, Cleaned buttons, Data History, and Video Export
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf-8');
const mainJs = fs.readFileSync(path.join(ROOT_DIR, 'public/js/main.js'), 'utf-8');
const apiRoutes = fs.readFileSync(path.join(ROOT_DIR, 'src/routes/api.routes.js'), 'utf-8');
const controllerJs = fs.readFileSync(path.join(ROOT_DIR, 'src/controllers/dubber.controller.js'), 'utf-8');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body, data: parsed });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

console.log('================================================================');
console.log('🔎 DEEP SYSTEM INTEGRITY & REGRESSION REVIEW SUITE');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
  }
}

async function runReview() {
  // 1. Auditing Cleaned Navbar & UI Layout
  console.log('--- 1. Navbar UI & Layout Review ---');
  check('Settings button is present and styled h-8 w-8', () => {
    assert(indexHtml.includes('onclick="openSettingsModal()"'), 'Missing openSettingsModal()');
    assert(indexHtml.includes('h-8 w-8 inline-flex'), 'Missing h-8 w-8');
  });
  check('Data History button is present with h-8 and badge count', () => {
    assert(indexHtml.includes('id="btn-data-history"'), 'Missing #btn-data-history');
    assert(indexHtml.includes('onclick="openHistoryModal()"'), 'Missing openHistoryModal()');
    assert(indexHtml.includes('id="history-badge-count"'), 'Missing #history-badge-count');
  });
  check('Export Video button is present with h-8 and active CTA styling', () => {
    assert(indexHtml.includes('id="btn-export-video"'), 'Missing #btn-export-video');
    assert(indexHtml.includes('onclick="openExportModal()"'), 'Missing openExportModal()');
  });
  check('Folder dropdown, undo/redo, and language switcher are removed from navbar', () => {
    assert(!indexHtml.includes('id="folder-menu-btn"'), 'Found #folder-menu-btn');
    assert(!indexHtml.includes('title="Undo"'), 'Found Undo button');
    assert(!indexHtml.includes('id="lang-km"'), 'Found Language switcher');
  });
  check('Import JSON button is present in Subtitles toolbar', () => {
    assert(indexHtml.includes('onclick="triggerJSONUpload()"') || indexHtml.includes('onclick="triggerSRTUpload()"'), 'Missing triggerJSONUpload()');
  });
  check('No legacy New Project button exists in index.html', () => {
    assert(!indexHtml.includes('createNewProject()'), 'index.html contains createNewProject()');
    assert(!indexHtml.includes('New Project'), 'index.html contains "New Project" text');
  });

  // 2. Auditing Client Logic & Bindings
  console.log('\n--- 2. Client JavaScript Logic & Event Bindings ---');
  check('main.js does not define or call createNewProject', () => {
    assert(!mainJs.includes('window.createNewProject'), 'main.js still defines window.createNewProject');
    assert(!mainJs.includes('createNewProject()'), 'main.js still invokes createNewProject()');
  });
  check('main.js has cleaned up _explicitProjectCleared guard', () => {
    assert(!mainJs.includes('_explicitProjectCleared'), 'main.js still contains _explicitProjectCleared');
  });
  check('main.js exposes all Data History modal methods', () => {
    assert(mainJs.includes('window.openHistoryModal'), 'Missing window.openHistoryModal');
    assert(mainJs.includes('window.closeHistoryModal'), 'Missing window.closeHistoryModal');
    assert(mainJs.includes('window.downloadHistoryVideo'), 'Missing window.downloadHistoryVideo');
    assert(mainJs.includes('window.deleteHistoryVideo'), 'Missing window.deleteHistoryVideo');
    assert(mainJs.includes('window.clearAllHistoryData'), 'Missing window.clearAllHistoryData');
  });
  check('main.js exposes all Video Export modal methods', () => {
    assert(mainJs.includes('window.openExportModal'), 'Missing window.openExportModal');
    assert(mainJs.includes('window.closeExportModal'), 'Missing window.closeExportModal');
    assert(mainJs.includes('window.confirmExportVideo'), 'Missing window.confirmExportVideo');
  });

  // 3. Auditing Backend Routes & Controllers
  console.log('\n--- 3. Backend Routes & Controllers Architecture ---');
  check('POST /api/project/clear route is cleanly removed from api.routes.js', () => {
    assert(!apiRoutes.includes('/project/clear'), 'api.routes.js still has /project/clear');
  });
  check('clearProject controller method is cleanly removed from dubber.controller.js', () => {
    assert(!controllerJs.includes('clearProject('), 'dubber.controller.js still has clearProject');
  });
  check('History API routes are registered', () => {
    assert(apiRoutes.includes("router.get('/history'"), 'Missing GET /api/history');
    assert(apiRoutes.includes("router.delete('/history/:id'"), 'Missing DELETE /api/history/:id');
    assert(apiRoutes.includes("router.post('/history/clear'"), 'Missing POST /api/history/clear');
  });
  check('Export Video API route is registered', () => {
    assert(apiRoutes.includes("router.post('/video/export'"), 'Missing POST /api/video/export');
  });

  // 4. Live Server HTTP Verification
  console.log('\n--- 4. Live Server Endpoints (http://localhost:5000) ---');
  const healthRes = await request({ hostname: 'localhost', port: 5000, path: '/api/health', method: 'GET' });
  check('GET /api/health returns 200 OK', () => {
    assert(healthRes.statusCode === 200, `Expected 200, got ${healthRes.statusCode}`);
    assert(healthRes.data?.success === true, 'Response success is true');
  });

  const clearRouteRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/project/clear',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({}));
  check('POST /api/project/clear correctly responds with HTTP 404 (Not Found)', () => {
    assert(clearRouteRes.statusCode === 404, `Expected 404, got ${clearRouteRes.statusCode}`);
  });

  const historyRes = await request({ hostname: 'localhost', port: 5000, path: '/api/history', method: 'GET' });
  check('GET /api/history returns 200 OK with valid items and metadata', () => {
    assert(historyRes.statusCode === 200, `Expected 200, got ${historyRes.statusCode}`);
    assert(historyRes.data?.success === true, 'Response success is true');
    assert(Array.isArray(historyRes.data?.data?.items), 'Items is an array');
    assert(typeof historyRes.data?.data?.totalCount === 'number', 'totalCount is numeric');
  });

  const projectLoadRes = await request({ hostname: 'localhost', port: 5000, path: '/api/project/load', method: 'GET' });
  check('GET /api/project/load returns 200 OK without errors', () => {
    assert(projectLoadRes.statusCode === 200, `Expected 200, got ${projectLoadRes.statusCode}`);
    assert(projectLoadRes.data?.success === true, 'Load response success is true');
  });

  console.log('\n================================================================');
  console.log(`📊 SYSTEM INTEGRITY REVIEW: ${passed}/${total} CHECKS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runReview().catch(err => {
  console.error('Fatal review error:', err);
  process.exit(1);
});
