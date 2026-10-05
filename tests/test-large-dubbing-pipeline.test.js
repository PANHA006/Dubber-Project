const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const videoRendererService = require('../src/services/video-renderer.service.js');

console.log('================================================================');
console.log('   🧪 E2E TEST: 270+ VOICE CLIPS DUBBING PIPELINE (FIX ENAMETOOLONG)');
console.log('================================================================\n');

async function main() {
  const voicesDir = path.join(__dirname, '../storage/voices');
  const videosDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

  const sampleVoicePath = path.join(voicesDir, 'test_sample_voice_270.wav');
  const sampleVideoPath = path.join(videosDir, 'test_sample_video_270.mp4');

  console.log('--- 1. GENERATING SYNTHETIC TEST FIXTURES ---');
  // Generate 1-second sample WAV voice clip
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=800:duration=1.0',
    '-c:a', 'pcm_s16le',
    sampleVoicePath
  ]);
  assert(fs.existsSync(sampleVoicePath), 'Sample voice clip created');
  console.log('✅ Generated sample voice clip:', sampleVoicePath);

  // Generate 5-second sample MP4 video with audio
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=5:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=300:duration=5',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    sampleVideoPath
  ]);
  assert(fs.existsSync(sampleVideoPath), 'Sample video created');
  console.log('✅ Generated sample test video:', sampleVideoPath);

  // 2. Build 270 mock subtitles (Exact scale of user video)
  console.log('\n--- 2. PREPARING 270 MOCK SUBTITLES ---');
  const subtitles270 = Array.from({ length: 270 }, (_, i) => ({
    id: `sub-clip-${i + 1}`,
    audioUrl: `/storage/voices/test_sample_voice_270.wav`,
    startSec: i * 0.015,
    endSec: i * 0.015 + 0.01,
    khmerText: `អត្ថបទខ្មែរជួរទី ${i + 1}`,
    originalText: `Sentence ${i + 1}`
  }));
  console.log(`✅ Created 270 subtitle items`);

  // 3. Test Dubbed Video Render with removeSpoken = false (User's Exact Scenario)
  console.log('\n--- 3. TESTING DUBBED VIDEO RENDER WITH 270 CLIPS (removeSpoken: false) ---');
  const startTime = Date.now();
  const result1 = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/test_sample_video_270.mp4',
    subtitles: subtitles270,
    settings: {
      removeSpoken: false,
      videoVolume: 1.0,
      dubVolume: 1.0,
      bgVolume: 20
    }
  });

  const durationMs = Date.now() - startTime;
  console.log(`✅ Render completed in ${(durationMs / 1000).toFixed(2)}s without ENAMETOOLONG!`);
  assert(result1.success, 'Render result1 must be success');
  assert(result1.dubbedVideoUrl, 'Must return dubbedVideoUrl');

  const output1 = videoRendererService.resolveVideoPath(result1.dubbedVideoUrl);
  assert(fs.existsSync(output1), 'Rendered output video must exist on disk');
  const stat1 = fs.statSync(output1);
  console.log(`   Output file: ${result1.filename} (${stat1.size} bytes)`);

  // 4. Test Dubbed Video Render with removeSpoken = true (Smart Audio Ducking with 270 clips)
  console.log('\n--- 4. TESTING DUBBED VIDEO RENDER WITH 270 CLIPS (removeSpoken: true - SMART DUCKING) ---');
  const startTime2 = Date.now();
  const result2 = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/test_sample_video_270.mp4',
    subtitles: subtitles270,
    settings: {
      removeSpoken: true,
      videoVolume: 1.0,
      dubVolume: 1.0,
      bgVolume: 10
    }
  });

  const durationMs2 = Date.now() - startTime2;
  console.log(`✅ Smart ducking render completed in ${(durationMs2 / 1000).toFixed(2)}s without ENAMETOOLONG!`);
  assert(result2.success, 'Render result2 must be success');

  const output2 = videoRendererService.resolveVideoPath(result2.dubbedVideoUrl);
  assert(fs.existsSync(output2), 'Rendered output video must exist on disk');

  // 5. Verify cleanup of temporary stem files
  console.log('\n--- 5. VERIFYING TEMPORARY FILES CLEANUP ---');
  const remainingTempStems = fs.readdirSync(voicesDir).filter(f => f.startsWith('temp_stem_') || f.startsWith('master_voice_'));
  assert.strictEqual(remainingTempStems.length, 0, 'All temporary stems and master voice files must be cleaned up');
  console.log('✅ PASS: Zero temporary stem files left behind on disk!');

  // Cleanup test fixtures
  try { if (fs.existsSync(sampleVoicePath)) fs.unlinkSync(sampleVoicePath); } catch (_) {}
  try { if (fs.existsSync(sampleVideoPath)) fs.unlinkSync(sampleVideoPath); } catch (_) {}
  try { if (fs.existsSync(output1)) fs.unlinkSync(output1); } catch (_) {}
  try { if (fs.existsSync(output2)) fs.unlinkSync(output2); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 ALL 270-CLIP PIPELINE TESTS PASSED 100% SUCCESSFULLY!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
