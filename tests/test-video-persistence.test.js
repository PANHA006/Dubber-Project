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
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function uploadMultipartFile(filename, contentBuffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`;
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

async function runVideoPersistenceSuite() {
  console.log('================================================================');
  console.log('   📹 TEST SUITE: VIDEO STORAGE PERSISTENCE & AUTO-RESTORE      ');
  console.log('================================================================\n');

  // --- 1. AUDITING SOURCE CODE IMPLEMENTATION ---
  console.log('--- 1. AUDITING SOURCE CODE IMPLEMENTATION ---');
  const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf-8');
  assert(appJs.includes("app.use('/storage/videos'"), 'app.js mounts /storage/videos static route');

  const apiRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/api.routes.js'), 'utf-8');
  assert(apiRoutes.includes("router.post('/video/upload'"), 'api.routes.js defines POST /video/upload route');
  assert(apiRoutes.includes('videoStorageDir'), 'api.routes.js configures persistent videoStorageDir');

  const controllerJs = fs.readFileSync(path.join(__dirname, '../src/controllers/dubber.controller.js'), 'utf-8');
  assert(controllerJs.includes('async uploadVideo'), 'dubber.controller.js defines uploadVideo handler');

  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('uploadVideoFileToServer'), 'video-player.js exports uploadVideoFileToServer');
  assert(videoPlayerJs.includes('loadVideoFromUrl'), 'video-player.js exports loadVideoFromUrl');

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  assert(mainJs.includes('videoUrl: state.videoUrl'), 'main.js getProjectPayload includes videoUrl');
  assert(mainJs.includes('loadVideoFromUrl'), 'main.js loadSavedProject calls loadVideoFromUrl');

  // --- 2. TESTING LIVE VIDEO UPLOAD API ---
  console.log('\n--- 2. TESTING LIVE VIDEO UPLOAD & SERVER DISK STORAGE ---');
  const sampleVideoData = Buffer.from('TEST_MP4_HEADER_PAYLOAD_' + Date.now() + '_REPEAT_'.repeat(50));
  const testFilename = `test_upload_${Date.now()}.mp4`;

  const uploadRes = await uploadMultipartFile(testFilename, sampleVideoData);
  assert(uploadRes.statusCode === 200, `POST /api/video/upload returned HTTP 200 (Got: ${uploadRes.statusCode})`);
  assert(uploadRes.body && uploadRes.body.success === true, 'Upload response returns success: true');
  assert(uploadRes.body.data && uploadRes.body.data.videoUrl.startsWith('/storage/videos/'), 'videoUrl starts with /storage/videos/');

  const storedVideoUrl = uploadRes.body.data.videoUrl;
  const storedFilename = uploadRes.body.data.filename;
  const physicalPath = path.join(__dirname, '../storage/videos', storedFilename);
  assert(fs.existsSync(physicalPath), `Video file physically saved on server: ${physicalPath}`);
  assert(fs.readFileSync(physicalPath).equals(sampleVideoData), 'Video file contents match uploaded binary data');

  // --- 3. TESTING STATIC STREAMING & HTTP RANGE SEEKING ---
  console.log('\n--- 3. TESTING VIDEO STREAMING & HTTP RANGE (SEEKING) ---');
  const streamRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: storedVideoUrl,
    method: 'GET'
  });
  assert(streamRes.statusCode === 200, `GET ${storedVideoUrl} returned HTTP 200`);
  assert(streamRes.headers['content-type']?.includes('video/mp4'), `Content-Type is video/mp4 (Got: ${streamRes.headers['content-type']})`);

  // Test Range header (206 Partial Content) for instant player scrubbing
  const rangeRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: storedVideoUrl,
    method: 'GET',
    headers: {
      'Range': 'bytes=0-49'
    }
  });
  assert(rangeRes.statusCode === 206, `Range request returned HTTP 206 Partial Content (Got: ${rangeRes.statusCode})`);
  assert(rangeRes.headers['content-range']?.includes('bytes 0-49/'), `Content-Range header returned (Got: ${rangeRes.headers['content-range']})`);
  assert(rangeRes.buffer.length === 50, `Range returned exactly 50 bytes (Got: ${rangeRes.buffer.length})`);

  // --- 4. TESTING PROJECT SAVE & LOAD WITH VIDEO URL ---
  console.log('\n--- 4. TESTING PROJECT PERSISTENCE WITH VIDEO URL ---');
  const projectPayload = {
    video: {
      name: testFilename,
      duration: 125.4,
      videoUrl: storedVideoUrl
    },
    subtitles: [
      { id: 'sub-01', start: '00:00:01,000', end: '00:00:04,000', khmerText: 'សួស្តីពិភពលោក', voice: 'Piseth (Male)' }
    ],
    dubbingSettings: { endPadding: 0.70 }
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
  assert(loadRes.body && loadRes.body.success === true, 'Project load succeeded');
  assert(loadRes.body.data.video.videoUrl === storedVideoUrl, `Authoritative project restores videoUrl: ${storedVideoUrl}`);
  assert(loadRes.body.data.video.duration === 125.4, 'Authoritative project restores video duration');
  assert(loadRes.body.data.video.name === testFilename, 'Authoritative project restores video name');
  assert(loadRes.body.data.subtitles.length === 1, 'Authoritative project restores subtitles concurrently');

  // Clean up test file
  try {
    if (fs.existsSync(physicalPath)) fs.unlinkSync(physicalPath);
  } catch (_) {}

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

runVideoPersistenceSuite().catch(err => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
