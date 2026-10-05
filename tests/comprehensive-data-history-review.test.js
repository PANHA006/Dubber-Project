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

async function runComprehensiveReview() {
  console.log('\n================================================================');
  console.log('🔍 COMPREHENSIVE REVIEW: DATA HISTORY MODAL & API PIPELINE');
  console.log('================================================================\n');

  // --- 1. Review HTML Architecture & Attributes ---
  console.log('--- 1. Reviewing HTML Architecture (public/index.html) ---');
  const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8').replace(/\r\n/g, '\n');

  assert(html.includes('id="btn-data-history"'), 'Navbar contains #btn-data-history button');
  assert(html.includes('onclick="openHistoryModal()"'), 'Data History button has onclick="openHistoryModal()"');
  assert(html.includes('class="h-8 px-3 inline-flex items-center gap-1.5'), '#btn-data-history has height class "h-8" (32px)');
  assert(html.includes('id="history-badge-count"'), '#history-badge-count exists for displaying count notification');
  assert(html.includes('id="data-history-modal"'), 'Modal container #data-history-modal exists');
  assert(html.includes('if (event.target === this) closeHistoryModal()'), 'Modal has backdrop dismiss click handler');
  assert(html.includes('id="history-header-count"'), 'Header count badge #history-header-count exists');
  assert(html.includes('id="history-header-stats"'), 'Header subtitle stats #history-header-stats exists');
  assert(html.includes('id="btn-clear-all-history"'), 'Clear all button #btn-clear-all-history exists');
  assert(html.includes('onclick="clearAllHistoryData()"'), 'Clear all button calls clearAllHistoryData()');
  assert(html.includes('id="history-preview-drawer"'), 'Preview drawer #history-preview-drawer exists');
  assert(html.includes('id="history-preview-video"'), 'Preview video element #history-preview-video exists');
  assert(html.includes('id="history-items-container"'), 'Scrollable items container #history-items-container exists');
  assert(html.includes('id="history-empty-banner"'), 'Empty state banner #history-empty-banner exists');
  assert(html.includes('id="history-footer-size"'), 'Footer storage size display #history-footer-size exists');

  // --- 2. Review Client-Side Logic & Keyboard Bindings ---
  console.log('\n--- 2. Reviewing JavaScript UX Logic (public/js/main.js) ---');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8').replace(/\r\n/g, '\n');

  assert(mainJs.includes('window.openHistoryModal = async function'), 'openHistoryModal() is exposed on window');
  assert(mainJs.includes('window.closeHistoryModal = function'), 'closeHistoryModal() is exposed on window');
  assert(mainJs.includes('window.closeHistoryPreview = function'), 'closeHistoryPreview() is exposed on window');
  assert(mainJs.includes('previewVideo.pause()'), 'closeHistoryPreview() pauses video to prevent background audio leak');
  assert(mainJs.includes('previewVideo.src = \'\''), 'closeHistoryPreview() clears video src to release memory');
  assert(mainJs.includes('window.playHistoryVideo = function'), 'playHistoryVideo() is exposed on window');
  assert(mainJs.includes('window.downloadHistoryVideo = function'), 'downloadHistoryVideo() is exposed on window');
  assert(mainJs.includes('link.download = fileName'), 'downloadHistoryVideo() sets download attribute with filename');
  assert(mainJs.includes('window.deleteHistoryVideo = async function'), 'deleteHistoryVideo() is exposed on window');
  assert(mainJs.includes('window.confirm('), 'deleteHistoryVideo() prompts confirmation before deleting');
  assert(mainJs.includes('window.clearAllHistoryData = async function'), 'clearAllHistoryData() is exposed on window');
  assert(mainJs.includes('window.loadAndRenderHistory = async function'), 'loadAndRenderHistory() is exposed on window');
  assert(mainJs.includes('historyModal && !historyModal.classList.contains(\'hidden\')'), 'Escape key closes data-history-modal');

  // --- 3. Review Backend Architecture & Services ---
  console.log('\n--- 3. Reviewing Backend Architecture & Routes ---');
  const routesJs = fs.readFileSync(path.join(rootDir, 'src', 'routes', 'api.routes.js'), 'utf-8').replace(/\r\n/g, '\n');
  assert(routesJs.includes("router.get('/history', dubberController.getHistory)"), 'Route GET /api/history is registered');
  assert(routesJs.includes("router.delete('/history/:id', dubberController.deleteHistoryItem)"), 'Route DELETE /api/history/:id is registered');
  assert(routesJs.includes("router.post('/history/clear', dubberController.clearAllHistory)"), 'Route POST /api/history/clear is registered');

  const controllerJs = fs.readFileSync(path.join(rootDir, 'src', 'controllers', 'dubber.controller.js'), 'utf-8').replace(/\r\n/g, '\n');
  assert(controllerJs.includes('async getHistory(req, res, next)'), 'Controller has getHistory method');
  assert(controllerJs.includes('async deleteHistoryItem(req, res, next)'), 'Controller has deleteHistoryItem method');
  assert(controllerJs.includes('async clearAllHistory(req, res, next)'), 'Controller has clearAllHistory method');

  const serviceJs = fs.readFileSync(path.join(rootDir, 'src', 'services', 'history.service.js'), 'utf-8').replace(/\r\n/g, '\n');
  assert(serviceJs.includes('getHistory()'), 'historyService has getHistory method');
  assert(serviceJs.includes('deleteRecord(id)'), 'historyService has deleteRecord method');
  assert(serviceJs.includes('clearAllHistory()'), 'historyService has clearAllHistory method');
  assert(serviceJs.includes('addRecord('), 'historyService has addRecord method');
  assert(serviceJs.includes('const { items } = this.getHistory()'), 'clearAllHistory syncs disk before clearing');

  // --- 4. Live API Execution & Edge Cases ---
  console.log('\n--- 4. Live API & Edge Case Tests on http://localhost:5000 ---');

  // 4.1 GET /api/history
  const initialHistory = await httpGet('/api/history');
  assert(initialHistory.statusCode === 200, `GET /api/history returns 200 OK (got ${initialHistory.statusCode})`);
  assert(initialHistory.data?.success === true, 'Response success is true');
  assert(typeof initialHistory.data?.data?.totalCount === 'number', 'totalCount is numeric');
  assert(typeof initialHistory.data?.data?.totalSizeMb === 'number', 'totalSizeMb is numeric');
  console.log(`  Current history: ${initialHistory.data?.data?.totalCount} items, ${initialHistory.data?.data?.totalSizeMb} MB`);

  // 4.2 Edge Case: Delete non-existent ID
  console.log('  Testing deletion of non-existent item ID...');
  const invalidDeleteRes = await httpDelete('/api/history/definitely_invalid_id_99999');
  assert(invalidDeleteRes.statusCode === 500, `Rejects non-existent item with 500 (got ${invalidDeleteRes.statusCode})`);

  // 4.3 Edge Case: Create a temporary exported mock file and test indexing, downloading, and deleting
  console.log('  Testing creation and lifecycle of a mock video item...');
  const exportsDir = path.join(rootDir, 'storage', 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const mockName = `review_mock_vid_${Date.now()}.mp4`;
  const mockPath = path.join(exportsDir, mockName);
  fs.writeFileSync(mockPath, 'TEST_MOCK_VIDEO_BINARY_DATA_FOR_REVIEW_TESTING', 'utf-8');

  // Verify auto-discovery on GET
  const afterMockHistory = await httpGet('/api/history');
  const mockItem = afterMockHistory.data?.data?.items?.find(it => it.fileName === mockName);
  assert(Boolean(mockItem), `Mock file automatically discovered: ${mockName}`);
  assert(mockItem?.url === `/storage/exports/${mockName}`, `URL correctly points to /storage/exports/${mockName}`);

  // Verify static HTTP GET download
  const mockDownload = await httpGet(mockItem.url);
  assert(mockDownload.statusCode === 200, `Static download of mock file returns 200 OK`);

  // Delete the mock item
  console.log(`  Deleting mock item id: ${mockItem.id}...`);
  const deleteMockRes = await httpDelete(`/api/history/${encodeURIComponent(mockItem.id)}`);
  assert(deleteMockRes.statusCode === 200, `DELETE returns 200 OK`);
  assert(deleteMockRes.data?.success === true, 'Delete response success is true');
  assert(!fs.existsSync(mockPath), `Mock file completely deleted from disk`);

  // Verify it is gone from history
  const verifyGone = await httpGet('/api/history');
  const stillThere = verifyGone.data?.data?.items?.find(it => it.fileName === mockName);
  assert(!stillThere, 'Mock file verified removed from history index');

  // --- 5. Verify All 8 Toolbar Button Heights (Uniform h-8 = 32px) ---
  console.log('\n--- 5. Verifying All Toolbar Buttons Uniform Height (h-8 / 32px) ---');
  const settingsBtnMatch = html.match(/<button onclick="openSettingsModal\(\)"[^>]*class="([^"]*)"/);
  assert(settingsBtnMatch && settingsBtnMatch[1].includes('h-8'), '1. Settings button has height class "h-8"');

  const autoSaveMatch = html.match(/<div id="autosave-badge"[^>]*class="([^"]*)"/);
  assert(autoSaveMatch && autoSaveMatch[1].includes('h-8'), '2. Auto-Saved badge has height class "h-8"');

  const serverBadgeMatch = html.match(/<div id="server-badge"[^>]*class="([^"]*)"/);
  assert(serverBadgeMatch && serverBadgeMatch[1].includes('h-8'), '3. Server badge has height class "h-8"');

  assert(!html.includes('id="folder-menu-btn"'), '4. Folder button cleanly removed from navbar');
  assert(!html.includes('title="Undo"'), '5. Undo/Redo cleanly removed from navbar');
  assert(!html.includes('id="lang-km"'), '6. Language switcher cleanly removed from navbar');

  const exportBtnMatch = html.match(/<button id="btn-export-video"[^>]*class="([^"]*)"/);
  assert(exportBtnMatch && exportBtnMatch[1].includes('h-8'), '7. Export Video button has height class "h-8"');

  const historyBtnMatch = html.match(/<button id="btn-data-history"[^>]*class="([^"]*)"/);
  assert(historyBtnMatch && historyBtnMatch[1].includes('h-8'), '8. Data History button has height class "h-8"');

  console.log('\n================================================================');
  console.log(`📊 REVIEW RESULT: ${passedChecks}/${totalChecks} Checks Passed (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runComprehensiveReview().catch(err => {
  console.error('Fatal review error:', err);
  process.exit(1);
});
