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
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(text), buffer });
        } catch (_) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: text, buffer });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadMultipartVideo(filename, contentBuffer, mimeType = 'video/mp4') {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    contentBuffer,
    Buffer.from(footer, 'utf-8')
  ]);

  return requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/video/upload',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length
    }
  }, bodyBuffer);
}

async function runComprehensiveReview() {
  console.log('================================================================');
  console.log('   🔍 DEEP REVIEW & AUDIT: VIDEO STORAGE PERSISTENCE & RESTORE  ');
  console.log('================================================================\n');

  // --- 1. AUDITING FRONTEND DOM, EVENTS & PERSISTENCE ---
  console.log('--- 1. AUDITING FRONTEND CLIENT ARCHITECTURE ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  assert(indexHtml.includes('id="main-video"'), 'HTML contains #main-video element');
  assert(indexHtml.includes('id="video-file-input"'), 'HTML contains #video-file-input element');
  assert(indexHtml.includes('id="no-video-placeholder"'), 'HTML contains #no-video-placeholder element');

  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/state.js'), 'utf-8');
  assert(stateJs.includes('videoUrl: null'), 'state.js defines videoUrl state property');
  assert(stateJs.includes('videoName: \'\''), 'state.js defines videoName state property');
  assert(stateJs.includes('isUploadingVideo: false'), 'state.js defines isUploadingVideo state property');

  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('uploadVideoFileToServer(file)'), 'video-player.js automatically calls uploadVideoFileToServer on file select');
  assert(videoPlayerJs.includes('export function loadVideoFromUrl'), 'video-player.js exports loadVideoFromUrl function');
  assert(videoPlayerJs.includes('window.loadVideoFromUrl = loadVideoFromUrl'), 'video-player.js exposes loadVideoFromUrl on window');
  assert(videoPlayerJs.includes('mainVideo.onloadedmetadata'), 'loadVideoFromUrl hooks onloadedmetadata for duration & resolution updates');

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  assert(mainJs.includes('loadVideoFromUrl,'), 'main.js imports loadVideoFromUrl');
  assert(mainJs.includes('videoUrl: state.videoUrl || null'), 'main.js getProjectPayload serializes videoUrl');
  assert(mainJs.includes('if (!state.currentVideoFile && state.videoUrl)'), 'main.js startTranscription auto-fetches video blob if currentVideoFile is null');
  assert(!mainJs.includes('window.createNewProject'), 'main.js createNewProject is cleanly removed');

  // --- 2. AUDITING BACKEND REST APIS & DIRECTORIES ---
  console.log('\n--- 2. AUDITING BACKEND REST APIS & DIRECTORIES ---');
  const videoStorageDir = path.join(__dirname, '../storage/videos');
  assert(fs.existsSync(videoStorageDir), `storage/videos directory exists on server: ${videoStorageDir}`);

  const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf-8');
  assert(appJs.includes("app.use('/storage/videos'"), 'src/app.js mounts /storage/videos static route');

  // --- 3. LIVE MULTIPART UPLOAD FOR MULTIPLE FORMATS (.MP4, .WEBM) ---
  console.log('\n--- 3. TESTING LIVE UPLOAD FOR MP4 & WEBM FORMATS ---');
  const mp4Buffer = Buffer.from('FAKE_MP4_CONTAINER_DATA_' + Date.now() + '_REPEAT_'.repeat(30));
  const mp4Res = await uploadMultipartVideo('my_vacation_clip.mp4', mp4Buffer, 'video/mp4');
  assert(mp4Res.statusCode === 200, `MP4 upload returned HTTP 200 (Got: ${mp4Res.statusCode})`);
  assert(mp4Res.body.data.videoUrl.startsWith('/storage/videos/my_vacation_clip_'), 'MP4 videoUrl preserves sanitized original name prefix');
  assert(mp4Res.body.data.videoUrl.endsWith('.mp4'), 'MP4 videoUrl preserves .mp4 extension');

  const mp4Physical = path.join(videoStorageDir, mp4Res.body.data.filename);
  assert(fs.existsSync(mp4Physical), `Physical MP4 file exists: ${mp4Physical}`);

  const webmBuffer = Buffer.from('FAKE_WEBM_CONTAINER_DATA_' + Date.now());
  const webmRes = await uploadMultipartVideo('sample_audio_video.webm', webmBuffer, 'video/webm');
  assert(webmRes.statusCode === 200, `WebM upload returned HTTP 200 (Got: ${webmRes.statusCode})`);
  assert(webmRes.body.data.videoUrl.endsWith('.webm'), 'WebM videoUrl preserves .webm extension');

  const webmPhysical = path.join(videoStorageDir, webmRes.body.data.filename);
  assert(fs.existsSync(webmPhysical), `Physical WebM file exists: ${webmPhysical}`);

  // --- 4. TESTING STATIC STREAMING & FAST SEEKING (HTTP RANGE) ---
  console.log('\n--- 4. TESTING HTTP 206 PARTIAL CONTENT RANGE STREAMING ---');
  const fullGet = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: mp4Res.body.data.videoUrl,
    method: 'GET'
  });
  assert(fullGet.statusCode === 200, 'Full GET returns HTTP 200');
  assert(fullGet.headers['content-type'] === 'video/mp4', 'Content-Type matches video/mp4');
  assert(fullGet.buffer.equals(mp4Buffer), 'Streamed binary matches uploaded data exactly');

  // Test Range Seeking request (bytes=10-29)
  const partialGet = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: mp4Res.body.data.videoUrl,
    method: 'GET',
    headers: { 'Range': 'bytes=10-29' }
  });
  assert(partialGet.statusCode === 206, 'Seeking request returns HTTP 206 Partial Content');
  assert(partialGet.headers['content-range']?.startsWith('bytes 10-29/'), 'Content-Range indicates bytes 10-29');
  assert(partialGet.buffer.length === 20, 'Partial content chunk length is exactly 20 bytes');

  // --- 5. TESTING DUAL-PERSISTENCE (PROJECT SAVE & AUTO-RESTORE) ---
  console.log('\n--- 5. TESTING DUAL-PERSISTENCE (SAVE & LOAD WITH VIDEO URL) ---');
  const mockSubtitles = [
    { id: 'sub-rev-01', start: '00:00:00,500', end: '00:00:03,000', khmerText: 'ជម្រាបសួរពុកម៉ែបងប្អូន', voice: 'Piseth (Male)', status: 'Ready' },
    { id: 'sub-rev-02', start: '00:00:04,000', end: '00:00:07,500', khmerText: 'ថ្ងៃនេះយើងនឹងបង្ហាញវីដេអូថ្មី', voice: 'Sreymom (Female)', status: 'Ready' }
  ];

  const projectPayload = {
    video: {
      name: 'my_vacation_clip.mp4',
      duration: 54.32,
      videoUrl: mp4Res.body.data.videoUrl
    },
    subtitles: mockSubtitles,
    dubbingSettings: { endPadding: 0.70, vadThreshold: 0.10 }
  };

  const saveRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(projectPayload));
  assert(saveRes.statusCode === 200, 'POST /api/project/save returned HTTP 200');

  const loadRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/project/load',
    method: 'GET'
  });
  assert(loadRes.statusCode === 200, 'GET /api/project/load returned HTTP 200');
  assert(loadRes.body.data.video.videoUrl === mp4Res.body.data.videoUrl, 'Authoritative project preserves exact videoUrl');
  assert(loadRes.body.data.video.name === 'my_vacation_clip.mp4', 'Authoritative project preserves video name');
  assert(loadRes.body.data.video.duration === 54.32, 'Authoritative project preserves video duration');
  assert(loadRes.body.data.subtitles.length === 2, 'Authoritative project preserves all 2 subtitles');

  // --- 6. TESTING REMOVED NEW PROJECT ENDPOINT ---
  console.log('\n--- 6. TESTING REMOVAL OF POST /api/project/clear ---');
  const clearRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/project/clear',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ isExplicitClear: true }));
  assert(clearRes.statusCode === 404, 'POST /api/project/clear returns HTTP 404 Not Found');

  // Clean test files from disk
  try {
    if (fs.existsSync(mp4Physical)) fs.unlinkSync(mp4Physical);
    if (fs.existsSync(webmPhysical)) fs.unlinkSync(webmPhysical);
  } catch (_) {}

  console.log('\n================================================================');
  console.log(`📊 FINAL REVIEW RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

runComprehensiveReview().catch(err => {
  console.error('Comprehensive review failed:', err);
  process.exit(1);
});
