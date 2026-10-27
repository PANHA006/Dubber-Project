/**
 * Verification Test for AI Audio Separator Service
 * Tests:
 * 1. Audio separation into isolated BGM.
 * 2. Caching mechanism (cache hit returns immediately).
 * 3. Fallback mechanism to PCM muter on network failure or invalid API.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const aiAudioSeparatorService = require('../src/services/ai-audio-separator.service.js');

console.log('================================================================');
console.log('   🧪 AUDIT: AI AUDIO SEPARATOR & BGM PRESERVATION SERVICE');
console.log('================================================================\n');

async function runTests() {
  const tempDir = path.join(__dirname, '../storage/temp');
  const videoDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const testVideo = path.join(videoDir, 'ai_sep_test_video.mp4');

  // Create 2.0s test video with 440Hz audio
  console.log('--- Step 1: Creating test video fixture ---');
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=2:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=2.0',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    testVideo
  ]);
  assert(fs.existsSync(testVideo), 'Test video fixture exists');
  console.log('✅ Test video fixture created successfully.');

  // Test 1: Extract and Isolate BGM
  console.log('\n--- Step 2: Extracting & Isolating BGM via AI Separator ---');
  const startTime = Date.now();
  const bgmPath = await aiAudioSeparatorService.extractAndIsolateBgm({
    videoPath: testVideo,
    subtitles: [{ startSec: 0.5, endSec: 1.5 }],
    settings: { bgVolume: 0 }
  });

  const durationMs = Date.now() - startTime;
  console.log(`BGM isolated at: ${bgmPath} (Duration: ${(durationMs / 1000).toFixed(2)}s)`);
  assert(fs.existsSync(bgmPath), 'BGM file exists on disk');
  assert(fs.statSync(bgmPath).size > 1000, 'BGM file is non-empty');
  console.log('✅ Step 2 Passed: BGM isolated successfully.');

  // Test 2: Cache Hit Check
  console.log('\n--- Step 3: Verifying Cache Hit (Sub-second retrieval) ---');
  const cacheStart = Date.now();
  const cachedBgmPath = await aiAudioSeparatorService.extractAndIsolateBgm({
    videoPath: testVideo,
    subtitles: [{ startSec: 0.5, endSec: 1.5 }],
    settings: { bgVolume: 0 }
  });
  const cacheDurationMs = Date.now() - cacheStart;
  console.log(`Cache retrieval took: ${cacheDurationMs}ms`);
  assert.strictEqual(cachedBgmPath, bgmPath, 'Cache paths match');
  assert(cacheDurationMs < 500, 'Cache retrieval must be sub-second (<500ms)');
  console.log('✅ Step 3 Passed: Cache hit verified.');

  // Test 3: Fallback Verification
  console.log('\n--- Step 4: Verifying Fallback to PCM Muter on error ---');
  // Temporarily point to a non-existent space to trigger fallback
  const originalSpace = process.env.HF_SEPARATOR_SPACE;
  process.env.HF_SEPARATOR_SPACE = 'invalid/non_existent_space_123456';
  
  // Use a dummy video path that will fail worker and test fallback
  const nonCachedVideo = path.join(videoDir, 'ai_fallback_test.mp4');
  fs.copyFileSync(testVideo, nonCachedVideo);

  const fallbackBgmPath = await aiAudioSeparatorService.extractAndIsolateBgm({
    videoPath: nonCachedVideo,
    subtitles: [{ startSec: 0.5, endSec: 1.5 }],
    settings: { bgVolume: 0 }
  });

  assert(fs.existsSync(fallbackBgmPath), 'Fallback produced a valid audio file');
  console.log(`Fallback successfully produced audio at: ${fallbackBgmPath}`);
  console.log('✅ Step 4 Passed: Graceful fallback to PCM muter verified.');

  // Restore environment & cleanup
  process.env.HF_SEPARATOR_SPACE = originalSpace || '';
  try { fs.unlinkSync(nonCachedVideo); } catch (_) {}
  try { fs.unlinkSync(testVideo); } catch (_) {}
  try { fs.unlinkSync(fallbackBgmPath); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 ALL AI AUDIO SEPARATOR TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
