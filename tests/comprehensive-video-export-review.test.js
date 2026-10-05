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

async function runComprehensiveReview() {
  console.log('\n================================================================');
  console.log('🔍 COMPREHENSIVE REVIEW: EXPORT VIDEO MODAL & API PIPELINE');
  console.log('================================================================\n');

  // 1. UI & DOM Architecture
  console.log('--- 1. Reviewing HTML & DOM Elements (public/index.html) ---');
  const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

  assert(html.includes('id="btn-export-video"'), 'Navbar has [Export Video] button with id="btn-export-video"');
  assert(html.includes('onclick="openExportModal()"'), 'Export button has onclick="openExportModal()"');
  assert(html.includes('id="export-video-modal"'), 'Modal element exists with id="export-video-modal"');
  assert(html.includes('if (event.target === this) closeExportModal()'), 'Modal has backdrop click-to-dismiss handler');
  assert(html.includes('id="export-modal-video"'), 'Video preview element id="export-modal-video" exists');
  assert(html.includes('id="export-no-video-banner"'), 'Warning banner id="export-no-video-banner" exists');
  assert(html.includes('onclick="triggerGenerateFromExportModal()"'), 'In-modal Generate button triggers triggerGenerateFromExportModal()');
  assert(html.includes('id="export-file-name"'), 'File name input id="export-file-name" exists');
  assert(html.includes('id="export-save-path"'), 'Save path input id="export-save-path" exists');
  assert(html.includes('onclick="resetExportPathToDefault()"'), 'Reset Default button triggers resetExportPathToDefault()');
  assert(html.includes('id="export-quality-select"'), 'Quality selector dropdown id="export-quality-select" exists');
  assert(html.includes('value="original"'), 'Quality option: original (Fast Copy) exists');
  assert(html.includes('value="high"'), 'Quality option: high (1080p Full HD) exists');
  assert(html.includes('value="720p"'), 'Quality option: 720p HD exists');
  assert(html.includes('value="4k"'), 'Quality option: 4k Ultra HD exists');
  assert(html.includes('id="btn-confirm-export"'), 'Confirm export button id="btn-confirm-export" exists');
  assert(html.includes('onclick="confirmExportVideo()"'), 'Confirm button calls confirmExportVideo()');

  // 2. JavaScript UX & Keyboard Shortcuts
  console.log('\n--- 2. Reviewing Client Logic & Keyboard Controls (public/js/main.js) ---');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');

  assert(mainJs.includes('window.openExportModal = function'), 'openExportModal() exposed on window');
  assert(mainJs.includes('window.closeExportModal = function'), 'closeExportModal() exposed on window');
  assert(mainJs.includes('videoEl.pause()'), 'closeExportModal() pauses video playback to prevent background audio leak');
  assert(mainJs.includes('window.resetExportPathToDefault = function'), 'resetExportPathToDefault() exposed on window');
  assert(mainJs.includes('window.triggerGenerateFromExportModal = async function'), 'triggerGenerateFromExportModal() exposed on window');
  assert(mainJs.includes('window.confirmExportVideo = async function'), 'confirmExportVideo() exposed on window');
  assert(mainJs.includes('exportModal && !exportModal.classList.contains(\'hidden\')'), 'Keyboard shortcuts handle Escape key to close export modal');
  assert(mainJs.includes('link.download = result.data.fileName'), 'confirmExportVideo() triggers client-side browser download');

  // 3. Backend Service & Code Implementation
  console.log('\n--- 3. Reviewing Backend Architecture & Routes ---');
  const appJs = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf-8');
  assert(appJs.includes('/storage/exports'), 'Express static route for /storage/exports is configured in app.js');

  const routesJs = fs.readFileSync(path.join(rootDir, 'src', 'routes', 'api.routes.js'), 'utf-8');
  assert(routesJs.includes("router.post('/video/export'"), 'API route router.post(/video/export) is registered');

  const controllerJs = fs.readFileSync(path.join(rootDir, 'src', 'controllers', 'dubber.controller.js'), 'utf-8');
  assert(controllerJs.includes('async exportVideo(req, res, next)'), 'Dubber controller exportVideo method handles requests');

  const serviceJs = fs.readFileSync(path.join(rootDir, 'src', 'services', 'video-renderer.service.js'), 'utf-8');
  assert(serviceJs.includes('exportDubbedVideo'), 'videoRendererService.exportDubbedVideo is implemented');
  assert(serviceJs.includes('relFromExport'), 'downloadUrl resolution handles relative & external paths');

  // 4. Live API & Edge Cases Verification
  console.log('\n--- 4. Live API & Edge Case Tests on http://localhost:5000 ---');

  // 4.1 Missing sourceVideoUrl
  const missingSourceRes = await httpPost('/api/video/export', { fileName: 'test.mp4' });
  assert(missingSourceRes.statusCode === 400, `Rejects missing sourceVideoUrl with 400 Bad Request (got ${missingSourceRes.statusCode})`);
  assert(missingSourceRes.data?.success === false, 'Error response contains success: false');

  // 4.2 Non-existent sourceVideoUrl
  const nonExistentRes = await httpPost('/api/video/export', {
    sourceVideoUrl: '/storage/videos/definitely_not_a_real_file_9999.mp4',
    fileName: 'test.mp4'
  });
  assert(nonExistentRes.statusCode === 500, `Rejects non-existent source video with 500 (got ${nonExistentRes.statusCode})`);
  assert(nonExistentRes.data?.message.includes('not found'), 'Error message clearly indicates source video not found');

  // 4.3 Locate real dubbed video for export tests
  const videosDir = path.join(rootDir, 'storage', 'videos');
  const files = fs.readdirSync(videosDir).filter(f => f.startsWith('dubbed_') && f.endsWith('.mp4'));
  if (files.length === 0) {
    console.warn('  ⚠️ No dubbed video found in storage/videos for testing.');
  } else {
    const testVideo = files[0];
    const testVideoUrl = `/storage/videos/${testVideo}`;
    console.log(`  Found test video: ${testVideo}`);

    // Edge Case 4.4: Custom filename without .mp4 extension
    console.log('  Testing export with filename missing .mp4 extension...');
    const noExtRes = await httpPost('/api/video/export', {
      sourceVideoUrl: testVideoUrl,
      fileName: 'review_test_no_extension',
      quality: 'original'
    });
    assert(noExtRes.statusCode === 200, `Returns 200 OK for filename without extension`);
    assert(noExtRes.data?.data?.fileName.endsWith('.mp4'), `Auto-appends .mp4: ${noExtRes.data?.data?.fileName}`);
    assert(fs.existsSync(noExtRes.data?.data?.fullPath), `Exported file exists on disk: ${noExtRes.data?.data?.fullPath}`);

    // Edge Case 4.5: Special characters in filename
    console.log('  Testing export with special characters in filename...');
    const specialCharsRes = await httpPost('/api/video/export', {
      sourceVideoUrl: testVideoUrl,
      fileName: 'test:special*name?.mp4',
      quality: 'original'
    });
    assert(specialCharsRes.statusCode === 200, `Returns 200 OK for special characters in filename`);
    assert(!/[<>:"/\\|?*]/.test(specialCharsRes.data?.data?.fileName), `Filename sanitized: ${specialCharsRes.data?.data?.fileName}`);

    // Edge Case 4.6: Custom subfolder path
    console.log('  Testing export with custom subfolder path (storage/exports/sub_review)...');
    const subfolderRes = await httpPost('/api/video/export', {
      sourceVideoUrl: testVideoUrl,
      fileName: 'review_subfolder_test.mp4',
      exportPath: 'storage/exports/sub_review',
      quality: 'original'
    });
    assert(subfolderRes.statusCode === 200, `Returns 200 OK with custom subfolder path`);
    assert(subfolderRes.data?.data?.fullPath.includes('sub_review'), `File saved in subfolder: ${subfolderRes.data?.data?.fullPath}`);
    assert(fs.existsSync(subfolderRes.data?.data?.fullPath), `Subfolder file exists on disk`);

    // Edge Case 4.7: High Quality Profile (1080p)
    console.log('  Testing export with High Quality profile (1080p, 320k audio)...');
    const highRes = await httpPost('/api/video/export', {
      sourceVideoUrl: testVideoUrl,
      fileName: 'review_high_quality.mp4',
      quality: 'high'
    });
    assert(highRes.statusCode === 200, `High quality export returns 200 OK`);
    assert(highRes.data?.data?.quality === 'high', `Response quality is high`);
    assert(fs.existsSync(highRes.data?.data?.fullPath), `High quality file created on disk`);

    // Edge Case 4.8: Verify HTTP download of exported video
    console.log('  Testing HTTP GET on downloadUrl...');
    const downloadCheck = await httpGet(highRes.data.data.downloadUrl);
    assert(downloadCheck.statusCode === 200, `GET ${highRes.data.data.downloadUrl} returns 200 OK`);
    assert(downloadCheck.headers['content-type'] === 'video/mp4', `Content-Type is video/mp4 (${downloadCheck.headers['content-type']})`);
  }

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
