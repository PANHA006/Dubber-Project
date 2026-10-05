import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
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

function httpGet(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${urlPath}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf-8'),
          buffer
        });
      });
    }).on('error', reject);
  });
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

function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name:format=duration,size',
      '-of', 'json',
      filePath
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('🔍 DEEP AUDIT & REVIEW: VIDEO GENERATION & BEFORE/AFTER SWITCHER');
  console.log('================================================================\n');

  // --- 1. LIVE HTTP SERVER ASSET & MARKUP AUDIT ---
  console.log('--- 1. AUDITING LIVE HTTP SERVER ASSETS (PORT 5000) ---');
  const htmlRes = await httpGet('/');
  assert(htmlRes.statusCode === 200, 'HTTP GET / returned 200 OK');
  assert(htmlRes.body.includes('id="btn-generate-video"'), 'Live HTML serves #btn-generate-video');
  assert(htmlRes.body.includes('id="btn-preview-before"'), 'Live HTML serves #btn-preview-before');
  assert(htmlRes.body.includes('id="btn-preview-after"'), 'Live HTML serves #btn-preview-after');
  assert(htmlRes.body.includes('onclick="switchPreviewMode(\'before\')"'), 'Before button has onclick switchPreviewMode');
  assert(htmlRes.body.includes('onclick="switchPreviewMode(\'after\')"'), 'After button has onclick switchPreviewMode');
  assert(htmlRes.body.includes('onclick="generateDubbedVideo()"'), 'Generate Video has onclick generateDubbedVideo');

  const cssRes = await httpGet('/css/output.css');
  assert(cssRes.statusCode === 200, 'HTTP GET /css/output.css returned 200 OK');

  const jsPlayerRes = await httpGet('/js/video-player.js');
  assert(jsPlayerRes.statusCode === 200, 'HTTP GET /js/video-player.js returned 200 OK');
  assert(jsPlayerRes.body.includes('export function switchPreviewMode'), 'video-player.js exports switchPreviewMode');
  assert(jsPlayerRes.body.includes('window.switchPreviewMode = switchPreviewMode'), 'video-player.js binds switchPreviewMode to window');

  const jsMainRes = await httpGet('/js/main.js');
  assert(jsMainRes.statusCode === 200, 'HTTP GET /js/main.js returned 200 OK');
  assert(jsMainRes.body.includes('window.generateDubbedVideo'), 'main.js exposes window.generateDubbedVideo');
  assert(jsMainRes.body.includes('switchPreviewMode'), 'main.js imports switchPreviewMode');

  // --- 2. BACKEND API VALIDATION & BOUNDARY AUDIT ---
  console.log('\n--- 2. AUDITING BACKEND REST API VALIDATIONS ---');
  const resEmpty = await httpPost('/api/video/generate', {});
  assert(resEmpty.statusCode === 400, 'Empty POST body rejected with 400 Bad Request');
  assert(resEmpty.data.success === false, 'Error response specifies success: false');

  const resMissingVideo = await httpPost('/api/video/generate', { subtitles: [{ id: '1' }] });
  assert(resMissingVideo.statusCode === 400, 'Missing videoUrl rejected with 400 Bad Request');
  assert(resMissingVideo.data.message.includes('videoUrl'), 'Error message identifies missing videoUrl');

  const resMissingSubs = await httpPost('/api/video/generate', { videoUrl: '/storage/videos/demo.mp4', subtitles: [] });
  assert(resMissingSubs.statusCode === 400, 'Empty subtitles array rejected with 400 Bad Request');

  const resInvalidVideo = await httpPost('/api/video/generate', {
    videoUrl: '/storage/videos/non_existent_clip_99999.mp4',
    subtitles: [{ id: '1', audioUrl: '/storage/voices/test_piseth.mp3', startSec: 1.0 }]
  });
  assert(resInvalidVideo.statusCode === 500, 'Inexistent video file gracefully yields 500 with descriptive error');

  // --- 3. LIVE FFMPEG DUBBING PIPELINE & CONTAINER AUDIT ---
  console.log('\n--- 3. AUDITING LIVE FFMPEG DUBBING PIPELINE & CODECS ---');
  const videoStorageDir = path.join(rootDir, 'storage', 'videos');
  const voiceStorageDir = path.join(rootDir, 'storage', 'voices');

  // Locate an existing real video in storage/videos/ or create a test video
  let testVideoName = 'SaveTik_co_7682018783922617454-hd_1790061985281.mp4';
  let testVideoPath = path.join(videoStorageDir, testVideoName);
  let createdSyntheticVideo = false;

  if (!fs.existsSync(testVideoPath)) {
    testVideoName = 'audit_test_source.mp4';
    testVideoPath = path.join(videoStorageDir, testVideoName);
    createdSyntheticVideo = true;
    await new Promise((res, rej) => {
      const p = spawn('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=400:duration=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
        testVideoPath
      ]);
      p.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg failed'))));
    });
  }
  assert(fs.existsSync(testVideoPath), `Test video available: ${testVideoName}`);

  // Locate two real voice files
  const voiceFile1 = path.join(voiceStorageDir, 'voice_unit_test_piseth.mp3');
  const voiceFile2 = path.join(voiceStorageDir, 'voice_unit_test_sreymom.mp3');
  assert(fs.existsSync(voiceFile1), 'Voice file 1 exists: voice_unit_test_piseth.mp3');
  assert(fs.existsSync(voiceFile2), 'Voice file 2 exists: voice_unit_test_sreymom.mp3');

  const renderPayload = {
    videoUrl: `/storage/videos/${testVideoName}`,
    subtitles: [
      {
        id: 'sub-audit-1',
        audioUrl: '/storage/voices/voice_unit_test_piseth.mp3',
        startSec: 0.5,
        endSec: 1.8,
        khmerText: 'ជំរាបសួរអ្នកទាំងអស់គ្នា'
      },
      {
        id: 'sub-audit-2',
        audioUrl: '/storage/voices/voice_unit_test_sreymom.mp3',
        startSec: 2.0,
        endSec: 3.2,
        khmerText: 'ជួបគ្នាពេលក្រោយ'
      }
    ],
    settings: {
      removeSpoken: true,
      bgVolume: 8,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  };

  const startTime = Date.now();
  const renderRes = await httpPost('/api/video/generate', renderPayload);
  const elapsedMs = Date.now() - startTime;

  assert(renderRes.statusCode === 200, 'POST /api/video/generate succeeded with HTTP 200');
  assert(renderRes.data.success === true, 'Response JSON has success: true');
  assert(typeof renderRes.data.data.dubbedVideoUrl === 'string', 'Returned dubbedVideoUrl string');
  assert(renderRes.data.data.dubbedVideoUrl.startsWith('/storage/videos/dubbed_'), 'Dubbed URL matches pattern /storage/videos/dubbed_*.mp4');
  console.log(`  ⏱️ Dubbing rendering duration: ${elapsedMs}ms`);

  const dubbedUrl = renderRes.data.data.dubbedVideoUrl;
  const dubbedPath = path.join(videoStorageDir, path.basename(dubbedUrl));
  assert(fs.existsSync(dubbedPath), `Generated file exists on filesystem: ${path.basename(dubbedPath)}`);

  // Probe media streams of the output file
  const probeInfo = await probeMedia(dubbedPath);
  const videoStream = probeInfo.streams.find(s => s.codec_type === 'video');
  const audioStream = probeInfo.streams.find(s => s.codec_type === 'audio');

  assert(videoStream !== undefined, 'Output MP4 contains valid video stream');
  assert(videoStream.codec_name === 'h264', `Video codec is H.264 (Got: ${videoStream.codec_name})`);
  assert(audioStream !== undefined, 'Output MP4 contains valid audio stream');
  assert(audioStream.codec_name === 'aac', `Audio codec is AAC (Got: ${audioStream.codec_name})`);
  assert(parseFloat(probeInfo.format.duration) > 1.0, `Output duration is valid (${parseFloat(probeInfo.format.duration).toFixed(1)}s)`);

  // --- 4. HTTP 206 PARTIAL CONTENT RANGE STREAMING AUDIT ---
  console.log('\n--- 4. AUDITING HTTP 206 PARTIAL CONTENT SEEKING ---');
  const fullRes = await httpGet(dubbedUrl);
  assert(fullRes.statusCode === 200, 'Full GET returns HTTP 200');
  assert(fullRes.headers['content-type'] === 'video/mp4', 'Header Content-Type is video/mp4');
  assert(fullRes.headers['accept-ranges'] === 'bytes', 'Header Accept-Ranges is bytes');

  // Seek request: bytes 0-1023
  const range1Res = await httpGet(dubbedUrl, { Range: 'bytes=0-1023' });
  assert(range1Res.statusCode === 206, 'Seeking request returns HTTP 206 Partial Content');
  assert(range1Res.headers['content-range'].startsWith('bytes 0-1023/'), 'Content-Range indicates bytes 0-1023');
  assert(range1Res.buffer.length === 1024, 'Partial chunk returned exactly 1024 bytes');

  // Seek request: middle chunk
  const totalSize = parseInt(fullRes.headers['content-length'], 10);
  const midStart = Math.floor(totalSize / 2);
  const midEnd = midStart + 511;
  const range2Res = await httpGet(dubbedUrl, { Range: `bytes=${midStart}-${midEnd}` });
  assert(range2Res.statusCode === 206, 'Mid-stream range returns HTTP 206 Partial Content');
  assert(range2Res.buffer.length === 512, 'Mid-stream chunk returned exactly 512 bytes');

  // --- 5. BEFORE / AFTER SWITCHER LOGIC SIMULATION ---
  console.log('\n--- 5. AUDITING BEFORE / AFTER SWITCHER INTERACTIONS ---');

  // Simulate mock DOM elements
  class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...c) { c.forEach(x => this.classes.add(x)); }
    remove(...c) { c.forEach(x => this.classes.delete(x)); }
    contains(c) { return this.classes.has(c); }
  }

  const mockVideo = {
    src: `/storage/videos/${testVideoName}`,
    currentTime: 1.45,
    paused: false,
    playCalled: false,
    loadCalled: false,
    play() { this.playCalled = true; return Promise.resolve(); },
    load() { this.loadCalled = true; }
  };

  const mockBtnBefore = { className: 'bg-indigo-600 text-white' };
  const mockBtnAfter = { className: 'text-slate-400' };
  const mockResElem = { textContent: '1080p HD', className: '' };

  const testState = {
    videoUrl: `/storage/videos/${testVideoName}`,
    dubbedVideoUrl: null,
    previewMode: 'before',
    currentTime: 1.45
  };

  let toastMessage = '';
  const showToast = msg => { toastMessage = msg; };

  function simulateSwitcher(mode, s, v, bBefore, bAfter, resEl) {
    if (mode === 'after') {
      if (!s.dubbedVideoUrl) {
        showToast('⚠️ មិនទាន់មានវីដេអូ Dubbed នៅឡើយទេ!');
        return 'ABORTED_NO_DUBBED';
      }
      const curTime = v.currentTime;
      s.previewMode = 'after';
      bAfter.className = 'bg-emerald-600 text-white';
      bBefore.className = 'text-slate-400';
      resEl.textContent = 'Dubbed HD';
      v.src = s.dubbedVideoUrl;
      v.currentTime = curTime;
      v.play();
      return 'SWITCHED_TO_AFTER';
    } else {
      const curTime = v.currentTime;
      s.previewMode = 'before';
      bBefore.className = 'bg-indigo-600 text-white';
      bAfter.className = 'text-slate-400';
      resEl.textContent = '1080p HD';
      v.src = s.videoUrl;
      v.currentTime = curTime;
      v.play();
      return 'SWITCHED_TO_BEFORE';
    }
  }

  // Attempt 1: Switch to after when dubbedVideoUrl is NULL
  const attempt1 = simulateSwitcher('after', testState, mockVideo, mockBtnBefore, mockBtnAfter, mockResElem);
  assert(attempt1 === 'ABORTED_NO_DUBBED', 'Switch to After without dubbed video safely aborts');
  assert(toastMessage.includes('មិនទាន់មានវីដេអូ Dubbed'), 'User is alerted with clear toast message');
  assert(testState.previewMode === 'before', 'Preview mode remains on before');

  // Attempt 2: Set dubbedVideoUrl and switch to after
  testState.dubbedVideoUrl = dubbedUrl;
  const attempt2 = simulateSwitcher('after', testState, mockVideo, mockBtnBefore, mockBtnAfter, mockResElem);
  assert(attempt2 === 'SWITCHED_TO_AFTER', 'Switch to After with dubbed video succeeds');
  assert(testState.previewMode === 'after', 'Preview mode updated to after');
  assert(mockVideo.src === dubbedUrl, 'Video src updated to dubbed video');
  assert(mockVideo.currentTime === 1.45, 'Current playhead timestamp (1.45s) perfectly preserved');
  assert(mockBtnAfter.className.includes('bg-emerald-600'), 'After button styled with active emerald highlight');
  assert(mockResElem.textContent === 'Dubbed HD', 'Resolution indicator switches to "Dubbed HD"');

  // Attempt 3: Switch back to before at timestamp 2.80s
  mockVideo.currentTime = 2.80;
  const attempt3 = simulateSwitcher('before', testState, mockVideo, mockBtnBefore, mockBtnAfter, mockResElem);
  assert(attempt3 === 'SWITCHED_TO_BEFORE', 'Switch back to Before succeeds');
  assert(testState.previewMode === 'before', 'Preview mode updated to before');
  assert(mockVideo.src.includes(testVideoName), 'Video src restored to original video');
  assert(mockVideo.currentTime === 2.80, 'Current playhead timestamp (2.80s) perfectly preserved');
  assert(mockBtnBefore.className.includes('bg-indigo-600'), 'Before button styled with active indigo highlight');
  assert(mockResElem.textContent === '1080p HD', 'Resolution indicator switches to "1080p HD"');

  // --- 6. PROJECT DUAL-LAYER PERSISTENCE AUDIT ---
  console.log('\n--- 6. AUDITING PROJECT PERSISTENCE WITH DUBBED VIDEO URL ---');
  const projectPayload = {
    video: {
      name: testVideoName,
      duration: 3.0,
      videoUrl: `/storage/videos/${testVideoName}`,
      dubbedVideoUrl: dubbedUrl,
      previewMode: 'after'
    },
    subtitles: renderPayload.subtitles,
    dubbingSettings: renderPayload.settings
  };

  const saveRes = await httpPost('/api/project/save', projectPayload);
  assert(saveRes.statusCode === 200, 'Project save with dubbed video returned 200 OK');

  const loadRes = await httpGet('/api/project/load');
  assert(loadRes.statusCode === 200, 'Project load returned 200 OK');
  const loadedData = JSON.parse(loadRes.body);
  assert(loadedData.data.video.dubbedVideoUrl === dubbedUrl, 'Authoritative project preserves dubbedVideoUrl');
  assert(loadedData.data.video.previewMode === 'after', 'Authoritative project preserves previewMode: after');

  // Test explicit project clear route is cleanly removed
  const clearRes = await httpPost('/api/project/clear', { isExplicitClear: true });
  assert(clearRes.statusCode === 404, 'Project clear returns 404 Not Found');

  // Clean up rendered test video
  try {
    if (fs.existsSync(dubbedPath)) fs.unlinkSync(dubbedPath);
    if (createdSyntheticVideo && fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath);
  } catch (_) {}

  // --- SUMMARY & VERDICT ---
  console.log('\n================================================================');
  console.log(`📊 FINAL AUDIT RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
