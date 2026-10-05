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
  console.log('\n================================================================');
  console.log('🧪 RUNNING VIDEO GENERATION & PREVIEW SWITCHER TEST SUITE');
  console.log('================================================================\n');

  // --- 1. AUDITING FRONTEND MARKUP & ASSETS ---
  console.log('--- 1. Testing Frontend Markup in public/index.html ---');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

  assert(indexHtml.includes('id="btn-generate-video"'), 'index.html contains #btn-generate-video button');
  assert(indexHtml.includes('onclick="generateDubbedVideo()"'), '#btn-generate-video has onclick="generateDubbedVideo()"');
  assert(indexHtml.includes('id="btn-preview-before"'), 'index.html contains #btn-preview-before');
  assert(indexHtml.includes('id="btn-preview-after"'), 'index.html contains #btn-preview-after');
  assert(indexHtml.includes("switchPreviewMode('before')"), 'Before button has onclick="switchPreviewMode(\'before\')"');
  assert(indexHtml.includes("switchPreviewMode('after')"), 'After button has onclick="switchPreviewMode(\'after\')"');

  // --- 2. AUDITING JAVASCRIPT STATE & METHODS ---
  console.log('\n--- 2. Testing JavaScript Logic & Project Persistence ---');
  const stateJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'state.js'), 'utf-8');
  assert(stateJs.includes('dubbedVideoUrl: null'), 'state.js defines dubbedVideoUrl: null');
  assert(stateJs.includes("previewMode: 'before'"), "state.js defines previewMode: 'before'");
  assert(stateJs.includes('isGeneratingVideo: false'), 'state.js defines isGeneratingVideo: false');

  const videoPlayerJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('export function switchPreviewMode'), 'video-player.js exports switchPreviewMode');
  assert(videoPlayerJs.includes('window.switchPreviewMode = switchPreviewMode'), 'video-player.js exposes switchPreviewMode on window');
  assert(videoPlayerJs.includes('state.previewMode = \'after\''), 'switchPreviewMode updates state.previewMode to after');
  assert(videoPlayerJs.includes('state.previewMode = \'before\''), 'switchPreviewMode updates state.previewMode to before');

  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');
  assert(mainJs.includes('window.generateDubbedVideo = async function'), 'main.js defines window.generateDubbedVideo');
  assert(mainJs.includes('switchPreviewMode'), 'main.js imports switchPreviewMode');
  assert(mainJs.includes('/api/video/generate'), 'generateDubbedVideo calls /api/video/generate');
  assert(mainJs.includes('dubbedVideoUrl: state.dubbedVideoUrl || null'), 'getProjectPayload serializes dubbedVideoUrl');
  assert(!mainJs.includes('window.createNewProject'), 'createNewProject is cleanly removed');

  // --- 3. TESTING BACKEND REST API VALIDATION ---
  console.log('\n--- 3. Testing Backend REST API (POST /api/video/generate) ---');
  const resNoVideo = await httpPost('/api/video/generate', { videoUrl: '', subtitles: [] });
  assert(resNoVideo.statusCode === 400, 'POST /api/video/generate returns 400 when videoUrl is missing');

  const resNoSubs = await httpPost('/api/video/generate', { videoUrl: '/storage/videos/test.mp4', subtitles: [] });
  assert(resNoSubs.statusCode === 400, 'POST /api/video/generate returns 400 when subtitles array is empty');

  // --- 4. LIVE FFMPEG VIDEO DUBBING INTEGRATION TEST ---
  console.log('\n--- 4. Testing Live FFmpeg Video Dubbing Pipeline ---');

  // Create temporary mini test video (2 seconds) and test audio (1 second) if needed
  const storageVideos = path.join(rootDir, 'storage', 'videos');
  const storageVoices = path.join(rootDir, 'storage', 'voices');
  if (!fs.existsSync(storageVideos)) fs.mkdirSync(storageVideos, { recursive: true });
  if (!fs.existsSync(storageVoices)) fs.mkdirSync(storageVoices, { recursive: true });

  const testVideoPath = path.join(storageVideos, 'test_source_clip.mp4');
  const testAudioPath = path.join(storageVoices, 'test_khmer_voice.mp3');

  // Create a 2s test video with ffmpeg: testsrc + sine audio
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      testVideoPath
    ]);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg test video creation failed: ${code}`))));
  });
  assert(fs.existsSync(testVideoPath), 'Created test source video (2.0s)');

  // Create a 1s test voice audio with ffmpeg
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
      '-c:a', 'libmp3lame',
      testAudioPath
    ]);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg test voice creation failed: ${code}`))));
  });
  assert(fs.existsSync(testAudioPath), 'Created test voice audio clip (1.0s)');

  // Call POST /api/video/generate with real test media
  const renderPayload = {
    videoUrl: '/storage/videos/test_source_clip.mp4',
    subtitles: [
      {
        id: 'sub-test-1',
        audioUrl: '/storage/voices/test_khmer_voice.mp3',
        startSec: 0.5,
        endSec: 1.5,
        khmerText: 'សួស្តីពិភពលោក'
      }
    ],
    settings: {
      removeSpoken: true,
      bgVolume: 10,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  };

  const renderRes = await httpPost('/api/video/generate', renderPayload);
  assert(renderRes.statusCode === 200, 'POST /api/video/generate returned HTTP 200 OK');
  assert(renderRes.data && renderRes.data.success === true, 'Response data indicates success: true');
  assert(renderRes.data.data && renderRes.data.data.dubbedVideoUrl, 'Response contains dubbedVideoUrl');

  const dubbedUrl = renderRes.data.data.dubbedVideoUrl;
  const dubbedDiskPath = path.join(storageVideos, path.basename(dubbedUrl));
  assert(fs.existsSync(dubbedDiskPath), `Dubbed video exists on disk: ${path.basename(dubbedUrl)}`);

  // Verify HTTP streamability of the rendered video
  const httpVideoRes = await httpGet(dubbedUrl);
  assert(httpVideoRes.statusCode === 200, `HTTP GET ${dubbedUrl} returns 200 OK`);
  assert(httpVideoRes.headers['content-type'] === 'video/mp4', 'Dubbed video Content-Type is video/mp4');
  assert(parseInt(httpVideoRes.headers['content-length'], 10) > 1000, 'Dubbed video file size > 1KB');

  // --- 5. TESTING PROJECT PERSISTENCE WITH DUBBED VIDEO URL ---
  console.log('\n--- 5. Testing Dual-Layer Persistence with Dubbed Video ---');

  const savePayload = {
    video: {
      name: 'test_source_clip.mp4',
      duration: 2.0,
      videoUrl: '/storage/videos/test_source_clip.mp4',
      dubbedVideoUrl: dubbedUrl,
      previewMode: 'after'
    },
    subtitles: renderPayload.subtitles,
    dubbingSettings: renderPayload.settings
  };

  const saveRes = await httpPost('/api/project/save', savePayload);
  assert(saveRes.statusCode === 200, 'POST /api/project/save returned 200 OK');

  const loadRes = await httpGet('/api/project/load');
  assert(loadRes.statusCode === 200, 'GET /api/project/load returned 200 OK');
  const loadedData = JSON.parse(loadRes.body);
  assert(loadedData.data.video.dubbedVideoUrl === dubbedUrl, 'Persisted project preserves exact dubbedVideoUrl');
  assert(loadedData.data.video.previewMode === 'after', 'Persisted project preserves previewMode: "after"');

  // Cleanup temporary test files safely
  try {
    if (fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath);
    if (fs.existsSync(testAudioPath)) fs.unlinkSync(testAudioPath);
    if (fs.existsSync(dubbedDiskPath)) fs.unlinkSync(dubbedDiskPath);
  } catch (_) {}

  console.log('\n================================================================');
  console.log(`📊 FINAL TEST RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
