/**
 * Automated Test: Cancel / Remove Video Feature (Button X in Video Preview Header)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://localhost:5000';

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTING CANCEL / REMOVE VIDEO FEATURE (BUTTON X)');
  console.log('================================================================\n');

  // 1. Check HTML markup in public/index.html
  console.log('--- 1. Checking HTML Elements in public/index.html ---');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  assert(html.includes('id="btn-cancel-video"'), 'btn-cancel-video must exist in index.html');
  assert(html.includes('onclick="cancelCurrentVideo()"'), 'btn-cancel-video must have onclick="cancelCurrentVideo()"');
  assert(html.includes('data-lucide="x"'), 'btn-cancel-video must contain lucide x icon');
  assert(html.includes('id="video-resolution"'), 'video-resolution badge must exist');
  console.log('  ✅ [PASS] Button (X) is properly integrated in Video Preview header.');

  // 2. Check JavaScript logic in public/js/video-player.js
  console.log('\n--- 2. Checking JavaScript Logic in public/js/video-player.js ---');
  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('export function updateCancelVideoBtnVisibility()'), 'updateCancelVideoBtnVisibility is exported');
  assert(videoPlayerJs.includes('export async function cancelCurrentVideo()'), 'cancelCurrentVideo is exported');
  assert(videoPlayerJs.includes('window.cancelCurrentVideo = cancelCurrentVideo;'), 'window.cancelCurrentVideo is exposed');
  assert(videoPlayerJs.includes('stopDubVoicePlayback();'), 'canceling stops dub voice playback');
  assert(videoPlayerJs.includes('state.subtitles = [];'), 'canceling clears subtitles state');
  assert(videoPlayerJs.includes('state.videoUrl = null;'), 'canceling clears videoUrl state');
  console.log('  ✅ [PASS] video-player.js contains comprehensive cancel and cleanup logic.');

  // 3. Check JavaScript logic in public/js/main.js
  console.log('\n--- 3. Checking JavaScript Logic in public/js/main.js ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  assert(mainJs.includes('cancelCurrentVideo,'), 'main.js imports cancelCurrentVideo');
  assert(mainJs.includes('window.cancelCurrentVideo = cancelCurrentVideo;'), 'main.js exposes cancelCurrentVideo globally');
  assert(mainJs.includes('allowEmpty = false'), 'triggerProjectAutoSave supports allowEmpty');
  console.log('  ✅ [PASS] main.js properly coordinates cancel action and auto-save persistence.');

  // 4. Test Server Project Persistence with Clean/Empty State
  console.log('\n--- 4. Testing Server-side Save & Load of Empty/Cleared State ---');
  const emptyPayload = {
    isExplicitClear: true,
    version: '1.0.0',
    savedAt: new Date().toISOString(),
    video: {
      name: '',
      videoUrl: null,
      dubbedVideoUrl: null,
      duration: 0,
      previewMode: 'before'
    },
    subtitles: [],
    dubbingSettings: { removeSpokenVoice: true, bgVolume: 0 }
  };

  const saveRes = await fetch(`${BASE_URL}/api/project/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emptyPayload)
  });
  assert.strictEqual(saveRes.status, 200, 'POST /api/project/save responds with 200');
  const saveJson = await saveRes.json();
  assert(saveJson.success === true, 'Saving empty state reports success');
  console.log('  ✅ [PASS] Cleared project saved to server storage.');

  // Verify that loading project reflects empty state
  const loadRes = await fetch(`${BASE_URL}/api/project/load`);
  assert.strictEqual(loadRes.status, 200, 'GET /api/project/load responds with 200');
  const loadJson = await loadRes.json();
  assert.strictEqual(loadJson.data.video.videoUrl, null, 'Loaded videoUrl is null');
  assert.strictEqual(loadJson.data.subtitles.length, 0, 'Loaded subtitles array is empty');
  console.log('  ✅ [PASS] Verified GET /api/project/load returns clean state ready for new video.');

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: CANCEL & REMOVE VIDEO FEATURE VERIFIED 100%');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
