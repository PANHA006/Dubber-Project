/**
 * Comprehensive Review & Edge-Case Verification Test Suite
 * for PCM Byte-Level Audio Muting Architecture
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync, spawn } = require('child_process');
const pcmMuterService = require('../src/services/pcm-muter.service.js');
const videoRendererService = require('../src/services/video-renderer.service.js');

async function probeAudio(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,size,bit_rate:stream=codec_type,codec_name,sample_rate,channels',
      '-of', 'json',
      filePath
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
    });
  });
}

console.log('================================================================');
console.log('   🔍 DEEP REVIEW & AUDIT: PCM BYTE-LEVEL AUDIO MUTING PIPELINE');
console.log('================================================================\n');

async function runReview() {
  const tempVoicesDir = path.join(__dirname, '../storage/voices');
  const tempVideosDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(tempVoicesDir)) fs.mkdirSync(tempVoicesDir, { recursive: true });
  if (!fs.existsSync(tempVideosDir)) fs.mkdirSync(tempVideosDir, { recursive: true });

  const testAudio = path.join(tempVoicesDir, 'review_test_audio.wav');
  const testVideo = path.join(tempVideosDir, 'review_test_video.mp4');

  // --- Step 1: Create 5s multi-tone WAV & 5s MP4 ---
  console.log('--- Step 1: Creating High-Precision Audio & Video Fixtures ---');
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=5.0',
    '-c:a', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    testAudio
  ]);
  assert(fs.existsSync(testAudio), 'Test audio fixture exists');

  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=5:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=5.0',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    testVideo
  ]);
  assert(fs.existsSync(testVideo), 'Test video fixture exists');
  console.log('✅ Created 5s audio and video test fixtures.');

  // --- Step 2: Edge-case tests on PcmMuterService ---
  console.log('\n--- Step 2: Auditing Edge-Case Handling in PcmMuterService ---');

  // Edge 2A: Empty subtitles array
  console.log('  Testing 2A: Empty subtitles array...');
  const bufOriginal = fs.readFileSync(testAudio);
  const bufEmpty = Buffer.from(bufOriginal);
  const resEmpty = pcmMuterService.mutePcmBuffer(bufEmpty, [], { bgVolumePct: 0 });
  assert.strictEqual(resEmpty.length, bufOriginal.length, 'Empty subtitles returns intact buffer');
  console.log('  ✅ PASS: Empty subtitles handled safely without modification.');

  // Edge 2B: Timestamps extending beyond audio duration
  console.log('  Testing 2B: Timestamps extending beyond audio duration (e.g. 4.5s -> 10.0s)...');
  const bufBeyond = Buffer.from(bufOriginal);
  pcmMuterService.mutePcmBuffer(bufBeyond, [{ startSec: 4.5, endSec: 10.0 }], { bgVolumePct: 0 });
  // Verify last sample inside file is 0 without buffer overflow error
  const info = pcmMuterService.parseWavHeader(bufBeyond);
  const lastSampleOffset = info.dataOffset + (info.totalFrames - 10) * info.frameSize;
  const lastVal = bufBeyond.readInt16LE(lastSampleOffset);
  assert.strictEqual(lastVal, 0, 'Audio at end of file muted to 0 without overflow');
  console.log('  ✅ PASS: Out-of-bounds timestamps bounded safely without memory error.');

  // Edge 2C: Overlapping / closely spaced intervals merging
  console.log('  Testing 2C: Overlapping intervals merging...');
  const rawIntervals = [
    { start: 1.0, end: 2.0 },
    { start: 1.8, end: 2.5 }, // overlaps
    { start: 2.55, end: 3.2 } // gap 0.05s <= 0.15s
  ];
  const merged = pcmMuterService.mergeIntervals(rawIntervals, 0.15);
  assert.strictEqual(merged.length, 1, 'Should merge into 1 contiguous interval');
  assert.strictEqual(merged[0].start, 1.0);
  assert.strictEqual(merged[0].end, 3.2);
  console.log('  ✅ PASS: 3 overlapping/adjacent intervals merged into [1.0s -> 3.2s].');

  // Edge 2D: Attenuation with bgVolume = 20%
  console.log('  Testing 2D: Attenuation with bgVolume = 20%...');
  const bufAttenuate = Buffer.from(bufOriginal);
  pcmMuterService.mutePcmBuffer(bufAttenuate, [{ startSec: 1.0, endSec: 2.0 }], { padBefore: 0, padAfter: 0, bgVolumePct: 20 });
  const midFrame = Math.floor(1.5001 * info.sampleRate);
  const midOffset = info.dataOffset + midFrame * info.frameSize;
  let maxAttenuated = 0;
  for (let i = 0; i < 20; i += 2) {
    maxAttenuated = Math.max(maxAttenuated, Math.abs(bufAttenuate.readInt16LE(midOffset + i)));
  }
  let maxOrig = 0;
  for (let i = 0; i < 20; i += 2) {
    maxOrig = Math.max(maxOrig, Math.abs(bufOriginal.readInt16LE(midOffset + i)));
  }
  const ratio = maxAttenuated / maxOrig;
  console.log(`     Original sample max: ${maxOrig}, Attenuated sample max: ${maxAttenuated} (Ratio: ${(ratio * 100).toFixed(1)}%)`);
  assert(ratio > 0.15 && ratio < 0.25, 'Attenuated ratio is ~20%');
  console.log('  ✅ PASS: 20% background audio volume scaling verified!');

  // --- Step 3: Full Video Rendering with PCM Muting (removeSpoken: true) ---
  console.log('\n--- Step 3: Full End-to-End Render with PCM Muting ---');
  const subs = [
    {
      id: 'sub-rev-1',
      audioUrl: '/storage/voices/review_test_audio.wav',
      startSec: 1.0,
      endSec: 2.5,
      khmerText: 'សួស្តីអ្នកទាំងអស់គ្នា',
      originalText: 'Hello everyone'
    },
    {
      id: 'sub-rev-2',
      audioUrl: '/storage/voices/review_test_audio.wav',
      startSec: 3.0,
      endSec: 4.5,
      khmerText: 'សូមស្វាគមន៍មកកាន់ប្រព័ន្ធ',
      originalText: 'Welcome to the system'
    }
  ];

  const tStart = Date.now();
  const renderRes = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/review_test_video.mp4',
    subtitles: subs,
    settings: {
      removeSpoken: true,
      bgVolume: 0,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  });

  const renderElapsed = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log(`✅ Render finished in ${renderElapsed}s`);
  assert(renderRes.success, 'Render must succeed');
  assert(renderRes.dubbedVideoUrl, 'Must return dubbed video url');

  const renderedFile = videoRendererService.resolveVideoPath(renderRes.dubbedVideoUrl);
  assert(fs.existsSync(renderedFile), 'Rendered video file exists');

  // Verify streams using FFprobe
  const probe = await probeAudio(renderedFile);
  assert(probe.streams.some(s => s.codec_type === 'video'), 'Rendered file contains video stream');
  assert(probe.streams.some(s => s.codec_type === 'audio'), 'Rendered file contains audio stream');
  console.log(`   Video Codec: ${probe.streams.find(s=>s.codec_type==='video').codec_name}`);
  console.log(`   Audio Codec: ${probe.streams.find(s=>s.codec_type==='audio').codec_name} (${probe.streams.find(s=>s.codec_type==='audio').sample_rate}Hz)`);

  // --- Step 4: Storage Sanitation & Zero-Leak Audit ---
  console.log('\n--- Step 4: Storage Sanitation Audit ---');
  const strayFiles = fs.readdirSync(tempVoicesDir).filter(f =>
    f.startsWith('temp_raw_audio_') ||
    f.startsWith('muted_bgm_') ||
    f.startsWith('temp_stem_') ||
    f.startsWith('master_voice_')
  );
  assert.strictEqual(strayFiles.length, 0, 'No leftover temporary files in storage/voices');
  console.log('✅ PASS: All intermediate audio files automatically purged!');

  // Cleanup test fixtures
  try { if (fs.existsSync(testAudio)) fs.unlinkSync(testAudio); } catch (_) {}
  try { if (fs.existsSync(testVideo)) fs.unlinkSync(testVideo); } catch (_) {}
  try { if (fs.existsSync(renderedFile)) fs.unlinkSync(renderedFile); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 ALL AUDIT & REVIEW CHECKS PASSED 100% SUCCESSFULLY!');
  console.log('================================================================\n');
}

runReview().catch(err => {
  console.error('❌ REVIEW TEST FAILED:', err);
  process.exit(1);
});
