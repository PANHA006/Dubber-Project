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

function httpPost(urlPath, payload) {
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
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 VIDEO EXPORT MODAL & API VERIFICATION SUITE');
  console.log('======================================================\n');

  // Step 1: Verify Static UI Elements in index.html
  console.log('📌 1. Verifying UI Elements in public/index.html...');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  assert(indexHtml.includes('id="btn-export-video"'), 'Navbar has [Export Video] CTA button (#btn-export-video)');
  assert(indexHtml.includes('onclick="openExportModal()"'), 'Export button calls openExportModal()');
  assert(indexHtml.includes('id="export-video-modal"'), 'Export modal container (#export-video-modal) exists');
  assert(indexHtml.includes('id="export-modal-video"'), 'Video preview element (#export-modal-video) exists in modal');
  assert(indexHtml.includes('id="export-no-video-banner"'), 'Fallback warning banner (#export-no-video-banner) exists');
  assert(indexHtml.includes('id="export-file-name"'), 'File name input field (#export-file-name) exists');
  assert(indexHtml.includes('id="export-save-path"'), 'Save path input field (#export-save-path) exists');
  assert(indexHtml.includes('id="export-quality-select"'), 'Quality selector dropdown (#export-quality-select) exists');
  assert(indexHtml.includes('id="btn-confirm-export"'), 'Export confirmation button (#btn-confirm-export) exists');
  assert(indexHtml.includes('onclick="confirmExportVideo()"'), 'Confirm button calls confirmExportVideo()');

  // Step 2: Verify Client Script in public/js/main.js
  console.log('\n📌 2. Verifying Client Logic in public/js/main.js...');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');
  assert(mainJs.includes('window.openExportModal = function'), 'window.openExportModal is defined');
  assert(mainJs.includes('window.closeExportModal = function'), 'window.closeExportModal is defined');
  assert(mainJs.includes('window.resetExportPathToDefault = function'), 'window.resetExportPathToDefault is defined');
  assert(mainJs.includes('window.triggerGenerateFromExportModal = async function'), 'window.triggerGenerateFromExportModal is defined');
  assert(mainJs.includes('window.confirmExportVideo = async function'), 'window.confirmExportVideo is defined');
  assert(mainJs.includes('/api/video/export'), 'Client script connects to /api/video/export');

  // Step 3: Verify Backend Routes, Controller, and Service
  console.log('\n📌 3. Verifying Backend Code Components...');
  const appJs = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf-8');
  assert(appJs.includes('/storage/exports'), 'app.js serves static /storage/exports route');

  const apiRoutes = fs.readFileSync(path.join(rootDir, 'src', 'routes', 'api.routes.js'), 'utf-8');
  assert(apiRoutes.includes("router.post('/video/export'"), 'API route router.post(/video/export) is registered');

  const dubberController = fs.readFileSync(path.join(rootDir, 'src', 'controllers', 'dubber.controller.js'), 'utf-8');
  assert(dubberController.includes('async exportVideo(req, res, next)'), 'dubberController.exportVideo method is implemented');

  const videoRenderer = fs.readFileSync(path.join(rootDir, 'src', 'services', 'video-renderer.service.js'), 'utf-8');
  assert(videoRenderer.includes('exportDubbedVideo'), 'videoRenderer.exportDubbedVideo method is implemented');
  assert(videoRenderer.includes('exportStorageDir'), 'videoRenderer initializes exportStorageDir');

  // Step 4: Verify Backend API Endpoints Live
  console.log('\n📌 4. Verifying Live API Behaviour on http://localhost:5000...');

  // 4.1 Missing params validation
  console.log('  Testing validation on missing sourceVideoUrl...');
  const badReq = await httpPost('/api/video/export', { fileName: 'test.mp4' });
  assert(badReq.statusCode === 400, `Returns 400 Bad Request when sourceVideoUrl missing (got ${badReq.statusCode})`);
  assert(badReq.data?.success === false, 'Response has success: false');

  // 4.2 Valid export test with dubbed video
  const dubbedVideoFile = 'dubbed_1790066437067_SaveTik_co_7682018783922617454-hd_1790061985281.mp4';
  const dubbedVideoPath = path.join(rootDir, 'storage', 'videos', dubbedVideoFile);
  const sampleVideoUrl = `/storage/videos/${dubbedVideoFile}`;

  if (fs.existsSync(dubbedVideoPath)) {
    console.log(`  Found existing dubbed video for test: ${dubbedVideoFile}`);

    // Export test 1: Fast original copy
    console.log('  Testing export with quality=original (fast copy)...');
    const exportResult1 = await httpPost('/api/video/export', {
      sourceVideoUrl: sampleVideoUrl,
      fileName: 'my_test_export_original.mp4',
      exportPath: 'storage/exports',
      quality: 'original'
    });

    assert(exportResult1.statusCode === 200, `Original export returns 200 OK (got ${exportResult1.statusCode})`);
    assert(exportResult1.data?.success === true, 'Original export returned success: true');
    assert(exportResult1.data?.data?.downloadUrl.startsWith('/storage/exports/'), `downloadUrl points to /storage/exports (${exportResult1.data?.data?.downloadUrl})`);
    assert(fs.existsSync(exportResult1.data?.data?.fullPath), `Target file created on disk: ${exportResult1.data?.data?.fullPath}`);

    // Verify static download of exported file
    const downloadRes = await httpGet(exportResult1.data.data.downloadUrl);
    assert(downloadRes.statusCode === 200, `GET ${exportResult1.data.data.downloadUrl} returns 200 OK`);

    // Export test 2: High quality re-encode
    console.log('  Testing export with quality=720p...');
    const exportResult2 = await httpPost('/api/video/export', {
      sourceVideoUrl: sampleVideoUrl,
      fileName: 'my_test_export_720p.mp4',
      exportPath: 'storage/exports',
      quality: '720p'
    });

    assert(exportResult2.statusCode === 200, `720p export returns 200 OK (got ${exportResult2.statusCode})`);
    assert(exportResult2.data?.success === true, '720p export returned success: true');
    assert(fs.existsSync(exportResult2.data?.data?.fullPath), `Target 720p file created on disk: ${exportResult2.data?.data?.fullPath}`);
  } else {
    console.warn(`  ⚠️ Sample dubbed video not found at ${dubbedVideoPath}, skipping live render test`);
  }

  console.log('\n======================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} Checks Passed (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('======================================================\n');

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
