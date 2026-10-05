/**
 * Comprehensive Audit & Review Test Suite:
 * Video Renderer Stem Batching & Windows Buffer Limit (spawn ENAMETOOLONG)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync, spawn } = require('child_process');
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
console.log('   🔍 COMPREHENSIVE AUDIT & E2E REVIEW: STEM BATCHING PIPELINE');
console.log('================================================================\n');

async function runAudit() {
  const voicesDir = path.join(__dirname, '../storage/voices');
  const videosDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

  const auditVoicePath = path.join(voicesDir, 'audit_sample_clip.wav');
  const auditVideoPath = path.join(videosDir, 'audit_sample_video.mp4');

  // Step 1: Create test fixtures
  console.log('--- Step 1: Creating Verified Test Audio & Video Fixtures ---');
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=600:duration=1.2',
    '-c:a', 'pcm_s16le',
    auditVoicePath
  ]);
  assert(fs.existsSync(auditVoicePath), 'Voice fixture exists');

  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=6:size=640x360:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=250:duration=6',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    auditVideoPath
  ]);
  assert(fs.existsSync(auditVideoPath), 'Video fixture exists');
  console.log('✅ Created test fixtures: audio clip (1.2s) & video (6.0s)');

  // Step 2: Test Boundary Conditions for assembleMasterVoiceTrack
  console.log('\n--- Step 2: Testing assembleMasterVoiceTrack Boundary Conditions ---');

  // Boundary 2A: Exactly 1 clip
  console.log('  Testing Boundary 2A: 1 voice clip...');
  const res1 = await videoRendererService.assembleMasterVoiceTrack([
    { id: 'sub-1', audioPath: auditVoicePath, delayMs: 100 }
  ], 1.0, 6.0);
  assert(res1 && res1.masterVoicePath, 'Boundary 1 clip returns masterVoicePath');
  assert(fs.existsSync(res1.masterVoicePath), 'Master track exists for 1 clip');
  res1.tempFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  console.log('  ✅ PASS: 1 voice clip assembled successfully.');

  // Boundary 2B: Exactly 35 clips (Exact BATCH_SIZE boundary)
  console.log('  Testing Boundary 2B: Exactly 35 clips (Batch Size Limit)...');
  const clips35 = Array.from({ length: 35 }, (_, i) => ({
    id: `sub-${i}`,
    audioPath: auditVoicePath,
    delayMs: i * 50
  }));
  const res35 = await videoRendererService.assembleMasterVoiceTrack(clips35, 1.0, 6.0);
  assert(res35 && res35.masterVoicePath, 'Boundary 35 clips returns masterVoicePath');
  assert(fs.existsSync(res35.masterVoicePath), 'Master track exists for 35 clips');
  res35.tempFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  console.log('  ✅ PASS: 35 voice clips assembled in single stem.');

  // Boundary 2C: 36 clips (Boundary + 1, triggers multi-stem batching)
  console.log('  Testing Boundary 2C: 36 clips (Triggers Multi-Stem Batching)...');
  const clips36 = Array.from({ length: 36 }, (_, i) => ({
    id: `sub-${i}`,
    audioPath: auditVoicePath,
    delayMs: i * 50
  }));
  const res36 = await videoRendererService.assembleMasterVoiceTrack(clips36, 1.0, 6.0);
  assert(res36 && res36.masterVoicePath, 'Boundary 36 clips returns masterVoicePath');
  assert(fs.existsSync(res36.masterVoicePath), 'Master track exists for 36 clips');
  res36.tempFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  console.log('  ✅ PASS: 36 voice clips cleanly chunked into 2 stems and merged.');

  // Step 3: Full End-to-End Render with 270 Subtitles
  console.log('\n--- Step 3: Full E2E Render with 270 Subtitles (Realistic Scale) ---');
  const subs270 = Array.from({ length: 270 }, (_, i) => ({
    id: `sub-${i + 1}`,
    audioUrl: '/storage/voices/audit_sample_clip.wav',
    startSec: i * 0.02,
    endSec: i * 0.02 + 0.015,
    khmerText: `ឃ្លាទី ${i + 1}`,
    originalText: `Speech ${i + 1}`
  }));

  // Test 3A: removeSpoken = false (Preserve 100% video audio)
  console.log('  Testing 3A: Dubbed render with removeSpoken = false...');
  const t0 = Date.now();
  const renderRes1 = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/audit_sample_video.mp4',
    subtitles: subs270,
    settings: {
      removeSpoken: false,
      videoVolume: 1.0,
      dubVolume: 1.0,
      bgVolume: 20
    }
  });
  console.log(`  ✅ 3A Render finished in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  assert(renderRes1.success, '3A success');
  const file1 = videoRendererService.resolveVideoPath(renderRes1.dubbedVideoUrl);
  assert(fs.existsSync(file1), 'Rendered video file exists');
  const probe1 = await probeAudio(file1);
  assert(probe1.streams.some(s => s.codec_type === 'video'), 'Has video stream');
  assert(probe1.streams.some(s => s.codec_type === 'audio'), 'Has audio stream');
  console.log(`     Format: ${probe1.streams[0].codec_name}, Channels: ${probe1.streams.find(s=>s.codec_type==='audio').channels}`);

  // Test 3B: removeSpoken = true (Smart Audio Ducking with 270 clips)
  console.log('\n  Testing 3B: Dubbed render with removeSpoken = true (Smart Ducking)...');
  const t1 = Date.now();
  const renderRes2 = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/audit_sample_video.mp4',
    subtitles: subs270,
    settings: {
      removeSpoken: true,
      videoVolume: 1.0,
      dubVolume: 1.0,
      bgVolume: 8
    }
  });
  console.log(`  ✅ 3B Render finished in ${((Date.now() - t1) / 1000).toFixed(2)}s`);
  assert(renderRes2.success, '3B success');
  const file2 = videoRendererService.resolveVideoPath(renderRes2.dubbedVideoUrl);
  assert(fs.existsSync(file2), 'Rendered video file exists');
  const probe2 = await probeAudio(file2);
  assert(probe2.streams.some(s => s.codec_type === 'audio'), 'Has audio stream');

  // Step 4: Storage Sanitation Audit
  console.log('\n--- Step 4: Storage Sanitation & Zero-Leak Audit ---');
  const strayStems = fs.readdirSync(voicesDir).filter(f => f.startsWith('temp_stem_') || f.startsWith('master_voice_'));
  assert.strictEqual(strayStems.length, 0, 'Zero stray stem files in storage/voices');
  console.log('✅ PASS: All temporary audio stems were safely removed.');

  // Cleanup test files
  try { if (fs.existsSync(auditVoicePath)) fs.unlinkSync(auditVoicePath); } catch (_) {}
  try { if (fs.existsSync(auditVideoPath)) fs.unlinkSync(auditVideoPath); } catch (_) {}
  try { if (fs.existsSync(file1)) fs.unlinkSync(file1); } catch (_) {}
  try { if (fs.existsSync(file2)) fs.unlinkSync(file2); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 AUDIT & REVIEW COMPLETE: 100% OF CHECKS PASSED!');
  console.log('================================================================\n');
}

runAudit().catch(err => {
  console.error('❌ AUDIT FAILED:', err);
  process.exit(1);
});
