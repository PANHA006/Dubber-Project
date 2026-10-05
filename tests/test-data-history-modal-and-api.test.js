import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

function httpPost(urlPath, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(`http://localhost:5000${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

function httpDelete(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:5000${urlPath}`, {
      method: 'DELETE'
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 DATA HISTORY MODAL & API VERIFICATION SUITE');
  console.log('================================================================\n');

  // Step 1: Verify UI Elements in index.html
  console.log('📌 1. Verifying HTML Elements in public/index.html...');
  const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8').replace(/\r\n/g, '\n');

  assert(html.includes('id="btn-data-history"'), 'Navbar has [Data History] button (#btn-data-history)');
  assert(html.includes('onclick="openHistoryModal()"'), 'Data History button calls openHistoryModal()');
  assert(html.includes('class="h-8 px-3 inline-flex items-center gap-1.5'), 'Data History button has height standard "h-8" matching Settings');
  assert(html.includes('id="history-badge-count"'), 'History badge count element (#history-badge-count) exists');
  assert(html.includes('id="data-history-modal"'), 'Data History modal container (#data-history-modal) exists');
  assert(html.includes('if (event.target === this) closeHistoryModal()'), 'Modal has backdrop dismiss handler');
  assert(html.includes('id="btn-clear-all-history"'), 'Clear all history button (#btn-clear-all-history) exists');
  assert(html.includes('onclick="clearAllHistoryData()"'), 'Clear all button calls clearAllHistoryData()');
  assert(html.includes('id="history-preview-drawer"'), 'History preview drawer (#history-preview-drawer) exists');
  assert(html.includes('id="history-preview-video"'), 'History preview video (#history-preview-video) exists');
  assert(html.includes('id="history-items-container"'), 'History items scrollable container (#history-items-container) exists');
  assert(html.includes('id="history-empty-banner"'), 'History empty state banner (#history-empty-banner) exists');

  // Step 2: Verify JavaScript Logic in main.js
  console.log('\n📌 2. Verifying Client Logic in public/js/main.js...');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8').replace(/\r\n/g, '\n');

  assert(mainJs.includes('window.openHistoryModal = async function'), 'window.openHistoryModal is defined');
  assert(mainJs.includes('window.closeHistoryModal = function'), 'window.closeHistoryModal is defined');
  assert(mainJs.includes('window.closeHistoryPreview = function'), 'window.closeHistoryPreview is defined');
  assert(mainJs.includes('window.playHistoryVideo = function'), 'window.playHistoryVideo is defined');
  assert(mainJs.includes('window.downloadHistoryVideo = function'), 'window.downloadHistoryVideo is defined');
  assert(mainJs.includes('window.deleteHistoryVideo = async function'), 'window.deleteHistoryVideo is defined');
  assert(mainJs.includes('window.clearAllHistoryData = async function'), 'window.clearAllHistoryData is defined');
  assert(mainJs.includes('window.loadAndRenderHistory = async function'), 'window.loadAndRenderHistory is defined');
  assert(mainJs.includes('historyModal && !historyModal.classList.contains(\'hidden\')'), 'Escape key dismisses data-history-modal');

  // Step 3: Verify Backend Components
  console.log('\n📌 3. Verifying Backend Service, Controller, and Routes...');
  const routesJs = fs.readFileSync(path.join(rootDir, 'src', 'routes', 'api.routes.js'), 'utf-8');
  assert(routesJs.includes("router.get('/history'"), 'Route GET /api/history is registered');
  assert(routesJs.includes("router.delete('/history/:id'"), 'Route DELETE /api/history/:id is registered');
  assert(routesJs.includes("router.post('/history/clear'"), 'Route POST /api/history/clear is registered');

  const controllerJs = fs.readFileSync(path.join(rootDir, 'src', 'controllers', 'dubber.controller.js'), 'utf-8');
  assert(controllerJs.includes('async getHistory('), 'dubberController.getHistory is implemented');
  assert(controllerJs.includes('async deleteHistoryItem('), 'dubberController.deleteHistoryItem is implemented');
  assert(controllerJs.includes('async clearAllHistory('), 'dubberController.clearAllHistory is implemented');

  const servicePath = path.join(rootDir, 'src', 'services', 'history.service.js');
  assert(fs.existsSync(servicePath), 'history.service.js exists on disk');

  // Step 4: Live API Behaviour on http://localhost:5000
  console.log('\n📌 4. Verifying Live API Behaviour on http://localhost:5000...');

  // 4.1 GET /api/history
  const getRes = await httpGet('/api/history');
  assert(getRes.statusCode === 200, `GET /api/history returns 200 OK (got ${getRes.statusCode})`);
  assert(getRes.data?.success === true, 'Response contains success: true');
  assert(Array.isArray(getRes.data?.data?.items), 'Response data contains items array');
  console.log(`  Discovered ${getRes.data?.data?.totalCount || 0} existing history videos (${getRes.data?.data?.totalSizeMb || 0} MB)`);

  // 4.2 Create a dummy test video in storage/exports
  const exportsDir = path.join(rootDir, 'storage', 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
  const testFileName = `test_dummy_history_${Date.now()}.mp4`;
  const testFilePath = path.join(exportsDir, testFileName);
  fs.writeFileSync(testFilePath, 'DUMMY_MP4_CONTENT_FOR_HISTORY_TEST', 'utf-8');

  // 4.3 GET /api/history to verify auto-discovery
  const refreshRes = await httpGet('/api/history');
  const foundTestItem = refreshRes.data?.data?.items?.find(it => it.fileName === testFileName);
  assert(Boolean(foundTestItem), `Auto-discovered new exported file: ${testFileName}`);

  if (foundTestItem) {
    // 4.4 DELETE /api/history/:id
    console.log(`  Deleting test item id: ${foundTestItem.id}...`);
    const delRes = await httpDelete(`/api/history/${encodeURIComponent(foundTestItem.id)}`);
    assert(delRes.statusCode === 200, `DELETE /api/history/${foundTestItem.id} returns 200 OK`);
    assert(delRes.data?.success === true, 'Delete response contains success: true');
    assert(!fs.existsSync(testFilePath), `File removed from disk: ${testFilePath}`);

    // 4.5 Verify item is gone
    const verifyDelRes = await httpGet('/api/history');
    const stillPresent = verifyDelRes.data?.data?.items?.find(it => it.fileName === testFileName);
    assert(!stillPresent, 'Item successfully removed from history records');
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} Checks Passed (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
