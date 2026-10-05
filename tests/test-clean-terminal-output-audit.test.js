/**
 * Verification Test: Clean Terminal Output Audit (No 270-line flooding & Clean Progress)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const videoRendererService = require('../src/services/video-renderer.service.js');

console.log('================================================================');
console.log('   🔍 AUDIT: CLEAN TERMINAL OUTPUT & NO-FLOODING VERIFICATION');
console.log('================================================================\n');

async function testCleanTerminalOutput() {
  const tempDir = path.join(__dirname, '../storage/voices');
  const videoDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const testAudioTone = path.join(tempDir, 'clean_term_tone.wav');
  const testVideo = path.join(videoDir, 'clean_term_video.mp4');

  // Create 6-second video & audio fixtures
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=6.0',
    '-c:a', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    testAudioTone
  ]);
  assert(fs.existsSync(testAudioTone), 'Audio fixture created');

  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=6:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=6.0',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    testVideo
  ]);
  assert(fs.existsSync(testVideo), 'Video fixture created');

  // Generate 50 realistic subtitle items to simulate high-volume segments
  const manySubtitles = [];
  for (let i = 1; i <= 50; i++) {
    const startSec = 0.5 + (i - 1) * 0.10;
    const endSec = startSec + 0.08;
    manySubtitles.push({
      id: `sub-flood-check-${i}`,
      audioUrl: '/storage/voices/clean_term_tone.wav',
      startSec,
      endSec
    });
  }

  console.log(`Simulating render with ${manySubtitles.length} subtitle segments...`);

  // Intercept console.log to count output lines and inspect for spam
  const interceptedLogs = [];
  const originalLog = console.log;
  console.log = function(...args) {
    const line = args.join(' ');
    interceptedLogs.push(line);
    originalLog.apply(console, args);
  };

  let renderRes;
  try {
    renderRes = await videoRendererService.renderDubbedVideo({
      videoUrl: '/storage/videos/clean_term_video.mp4',
      subtitles: manySubtitles,
      settings: {
        removeSpoken: true,
        bgVolume: 15,
        videoVolume: 1.0,
        dubVolume: 1.0
      }
    });
  } finally {
    console.log = originalLog;
  }

  assert(renderRes.success, 'Render must succeed');
  const renderedPath = videoRendererService.resolveVideoPath(renderRes.dubbedVideoUrl);
  assert(fs.existsSync(renderedPath), 'Rendered video file exists');

  console.log('\n--- Output Line Count & Spam Analysis ---');
  console.log(`Total console lines intercepted: ${interceptedLogs.length}`);

  // Count occurrences of [MUTE:SEGMENT]
  const segmentLogCount = interceptedLogs.filter(l => l.includes('MUTE:SEGMENT')).length;
  console.log(`Individual [MUTE:SEGMENT] lines: ${segmentLogCount}`);
  assert.strictEqual(segmentLogCount, 0, 'Must NOT output individual [MUTE:SEGMENT] lines when segments > 3');

  // Verify that MUTE:SUMMARY is present
  const summaryLogCount = interceptedLogs.filter(l => l.includes('MUTE:SUMMARY')).length;
  console.log(`Summary [MUTE:SUMMARY] lines: ${summaryLogCount}`);
  assert(summaryLogCount > 0, 'Must output clean MUTE:SUMMARY line');

  // Total lines during the whole render of 50 clips must be very small (< 30 lines)
  assert(interceptedLogs.length < 30, `Total lines should be compact and clean (< 30 lines, got ${interceptedLogs.length})`);
  console.log('✅ PASS: Terminal output is clean, compact, and free from flooding!');

  // Cleanup
  try { if (fs.existsSync(testAudioTone)) fs.unlinkSync(testAudioTone); } catch (_) {}
  try { if (fs.existsSync(testVideo)) fs.unlinkSync(testVideo); } catch (_) {}
  try { if (fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 CLEAN TERMINAL AUDIT PASSED 100% SUCCESSFULLY!');
  console.log('================================================================\n');
}

testCleanTerminalOutput().catch(err => {
  console.error('❌ CLEAN TERMINAL AUDIT FAILED:', err);
  process.exit(1);
});
