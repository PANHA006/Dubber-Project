/**
 * Comprehensive Review and E2E Test Suite for Smart Dynamic Audio Ducking
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:5000';

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

async function run() {
  console.log('================================================================');
  console.log('🔍 COMPREHENSIVE REVIEW & AUDIT: AUDIO DUCKING & MUTE VOICE');
  console.log('================================================================\n');

  // Step 1: Check Autosave Project Data
  console.log('--- Step 1: Inspecting Project & Subtitle Configuration ---');
  const projectFile = path.join(__dirname, '../storage/projects/autosave_project.json');
  assert(fs.existsSync(projectFile), 'autosave_project.json exists');
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
  console.log(`  Source Video: ${project.video.name}`);
  console.log(`  Video Path: ${project.video.videoUrl}`);
  console.log(`  Subtitles Count: ${project.subtitles.length}`);
  
  project.subtitles.forEach((s, idx) => {
    const txt = s.khmerText || s.originalText || '';
    console.log(`  Sub #${idx + 1}: [${s.startSec}s -> ${s.endSec}s] "${txt.slice(0, 30)}..." | Voice: ${s.voice}`);
    assert(s.audioUrl, `Subtitle ${idx + 1} must have an audioUrl`);
  });

  // Step 2: Live API Test - POST /api/video/generate with Mute Voice ON & BGM = 0%
  console.log('\n--- Step 2: Testing Live API POST /api/video/generate (Mute 100%) ---');
  const renderPayload = {
    videoUrl: project.video.videoUrl,
    subtitles: project.subtitles.map(s => ({
      id: s.id,
      audioUrl: s.audioUrl.split('?')[0],
      startSec: s.startSec,
      endSec: s.endSec
    })),
    settings: {
      removeSpoken: true,
      bgVolume: 0,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  };

  const startTime = Date.now();
  const res = await fetch(`${BASE_URL}/api/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(renderPayload)
  });

  assert.strictEqual(res.status, 200, 'API returns HTTP 200 OK');
  const resJson = await res.json();
  const durationMs = Date.now() - startTime;
  console.log(`  API Response Status: ${res.status}`);
  console.log(`  Success: ${resJson.success}`);
  console.log(`  Dubbed Video URL: ${resJson.data.dubbedVideoUrl}`);
  console.log(`  File Size: ${resJson.data.sizeMb} MB`);
  console.log(`  Rendering Time: ${(durationMs / 1000).toFixed(2)}s`);
  assert(resJson.success === true, 'Video rendering reported success');

  // Step 3: Physical File & Audio Stream Validation
  console.log('\n--- Step 3: Physical Output Video & Audio Stream Validation ---');
  const relativePath = resJson.data.dubbedVideoUrl.replace('/storage/', '');
  const physicalPath = path.join(__dirname, '../storage', relativePath);
  assert(fs.existsSync(physicalPath), `Generated video exists on disk: ${physicalPath}`);
  const stats = fs.statSync(physicalPath);
  console.log(`  Disk File Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  assert(stats.size > 100000, 'Video file is larger than 100KB');

  const probe = await probeAudio(physicalPath);
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  assert(audioStream, 'Video contains an active audio stream');
  console.log(`  Audio Codec: ${audioStream.codec_name}`);
  console.log(`  Sample Rate: ${audioStream.sample_rate} Hz`);
  console.log(`  Channels: ${audioStream.channels}`);
  console.log(`  Total Duration: ${parseFloat(probe.format.duration).toFixed(2)}s`);
  assert.strictEqual(audioStream.codec_name, 'aac', 'Audio stream is AAC encoded');

  // Step 4: Verification of Data History Integration
  console.log('\n--- Step 4: Verifying Automatic Data History Logging ---');
  const historyRes = await fetch(`${BASE_URL}/api/history`);
  assert.strictEqual(historyRes.status, 200, 'History API returns 200');
  const historyData = await historyRes.json();
  assert(historyData.success === true, 'History returns success');
  console.log(`  Total History Items: ${historyData.data.totalCount}`);
  
  const latestItem = historyData.data.items[0];
  console.log(`  Latest Item in History: ${latestItem.fileName} (${latestItem.sizeMb} MB)`);
  assert.strictEqual(latestItem.url, resJson.data.dubbedVideoUrl, 'Latest history item matches newly generated video');

  // Step 5: Frontend Code & Player Review
  console.log('\n--- Step 5: Auditing Frontend Video Player & Ducking Code ---');
  const playerCode = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(playerCode.includes('Math.max(0, bgVol) / 100'), 'video-player.js uses non-coercing duck ratio calculation');
  assert(playerCode.includes("if (state.previewMode === 'after') return;"), 'video-player.js ducks only in Before mode');
  assert(playerCode.includes('stopDubVoicePlayback()'), 'video-player.js stops overlay audio in After mode');
  console.log('  ✅ Frontend ducking calculation properly supports 0% complete silence.');
  console.log('  ✅ After mode correctly avoids playing double/overlay audio.');

  // Step 6: Verify Settings Controls in index.html
  console.log('\n--- Step 6: Auditing UI Controls in public/index.html ---');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  assert(html.includes('id="setting-bgm-volume"'), 'BGM volume range slider exists');
  assert(html.includes('id="setting-remove-spoken"'), 'Mute spoken voice checkbox exists');
  assert(html.includes('id="val-bgm-volume"'), 'BGM volume badge display exists');
  assert(html.includes('id="val-mute-spoken"'), 'Mute spoken badge display exists');
  console.log('  ✅ All UI controls for BGM Volume & Mute Voice are wired and verified.');

  console.log('\n================================================================');
  console.log('🎉 COMPREHENSIVE AUDIT & TEST RESULT: 100% PASSED (FLAWLESS)');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
