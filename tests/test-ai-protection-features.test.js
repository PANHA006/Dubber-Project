/**
 * Verification Test for:
 * 1. Multi-Space Failover Pool
 * 2. Audio Chunking Engine (for long media)
 * 3. Fallback Resilience
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const aiAudioSeparatorService = require('../src/services/ai-audio-separator.service.js');

console.log('================================================================');
console.log('   🧪 AUDIT: MULTI-SPACE FAILOVER & CHUNKING ENGINE AUDIT');
console.log('================================================================\n');

async function runTests() {
  const tempDir = path.join(__dirname, '../storage/temp');
  const videoDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const testVideo = path.join(videoDir, 'protection_test_video.mp4');

  // Step 1: Create 2s test fixture
  console.log('--- Step 1: Creating test video fixture ---');
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=2:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=500:duration=2.0',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    testVideo
  ]);
  assert(fs.existsSync(testVideo), 'Test video fixture exists');

  // Step 2: Test Multi-Space Failover
  console.log('\n--- Step 2: Testing Multi-Space Failover ---');
  // Temporarily prepend a non-existent space to verify it automatically fails over to the next
  const originalSpace = process.env.HF_SEPARATOR_SPACE;
  process.env.HF_SEPARATOR_SPACE = 'invalid/non_existent_first_space_123';

  const pool = aiAudioSeparatorService.getSpacesPool();
  console.log('Active Space Pool:', pool);
  assert(pool.length >= 2, 'Pool must contain at least 2 candidate spaces');
  assert.strictEqual(pool[0], 'invalid/non_existent_first_space_123', 'First space is the invalid test space');

  const bgmPath = await aiAudioSeparatorService.extractAndIsolateBgm({
    videoPath: testVideo,
    subtitles: [{ startSec: 0.5, endSec: 1.5 }],
    settings: { bgVolume: 0 }
  });

  assert(fs.existsSync(bgmPath), 'BGM file was created successfully via failover');
  console.log('✅ Step 2 Passed: Multi-Space Failover successfully resolved BGM despite primary failure.');

  // Step 3: Test Audio Chunking Logic
  console.log('\n--- Step 3: Testing Audio Chunking Engine ---');
  // Lower the threshold temporarily to test chunking on a small fixture
  const originalThreshold = aiAudioSeparatorService.chunkThresholdSec;
  const originalChunkDur = aiAudioSeparatorService.chunkDurationSec;
  aiAudioSeparatorService.chunkThresholdSec = 1; // trigger chunking even on 2s audio
  aiAudioSeparatorService.chunkDurationSec = 1;  // 1s per chunk

  const chunkedTestVideo = path.join(videoDir, 'chunking_test_video.mp4');
  fs.copyFileSync(testVideo, chunkedTestVideo);

  const chunkedBgm = await aiAudioSeparatorService.extractAndIsolateBgm({
    videoPath: chunkedTestVideo,
    subtitles: [{ startSec: 0.5, endSec: 1.5 }],
    settings: { bgVolume: 0 }
  });

  assert(fs.existsSync(chunkedBgm), 'Chunking engine produced final concatenated BGM');
  console.log('✅ Step 3 Passed: Audio Chunking Engine verified.');

  // Restore configurations & cleanup
  process.env.HF_SEPARATOR_SPACE = originalSpace || '';
  aiAudioSeparatorService.chunkThresholdSec = originalThreshold;
  aiAudioSeparatorService.chunkDurationSec = originalChunkDur;

  try { fs.unlinkSync(testVideo); } catch (_) {}
  try { fs.unlinkSync(chunkedTestVideo); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 ALL PROTECTION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Protection test failed:', err);
  process.exit(1);
});
