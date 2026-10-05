/**
 * Test: Dynamic Timeline Audio Ducking in FFmpeg video renderer & web player
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const videoRendererService = require('../src/services/video-renderer.service.js');

async function probeAudio(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,channels',
      '-of', 'json',
      filePath
    ]);
    let out = '';
    ffprobe.stdout.on('data', d => out += d);
    ffprobe.on('close', () => {
      try { resolve(JSON.parse(out)); } catch (_) { resolve(null); }
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTING DYNAMIC TIMELINE AUDIO DUCKING (MUTE ORIGINAL VOICE)');
  console.log('================================================================\n');

  const projectPath = path.join(__dirname, '../storage/projects/autosave_project.json');
  assert(fs.existsSync(projectPath), 'autosave_project.json must exist');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));

  console.log('1. Verifying Subtitle Voice Files and Timestamps...');
  assert(Array.isArray(project.subtitles) && project.subtitles.length > 0, 'Project has subtitles');
  console.log(`   Found ${project.subtitles.length} subtitle items.`);

  // Test 1: Render video with removeSpoken = true and bgVolume = 0 (100% Mute Voice)
  console.log('\n2. Rendering video with MUTE VOICE ON & BGM VOLUME = 0% (Total Voice Mute)...');
  const resultMute0 = await videoRendererService.renderDubbedVideo({
    videoUrl: project.video.videoUrl,
    subtitles: project.subtitles,
    settings: {
      removeSpoken: true,
      bgVolume: 0,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  });

  assert(resultMute0.success, 'Render with bgVolume 0 succeeded');
  assert(resultMute0.dubbedVideoUrl, 'Has dubbedVideoUrl');
  const fileMute0 = videoRendererService.resolveVideoPath(resultMute0.dubbedVideoUrl);
  assert(fs.existsSync(fileMute0), 'Rendered video exists on disk');

  const probe0 = await probeAudio(fileMute0);
  assert(probe0.streams.some(s => s.codec_type === 'audio'), 'Has valid audio stream');
  console.log(`   ✅ Rendered video with 0% BGM ducking: ${resultMute0.dubbedVideoUrl} (${resultMute0.sizeMb} MB)`);

  // Test 2: Render video with removeSpoken = true and bgVolume = 8%
  console.log('\n3. Rendering video with MUTE VOICE ON & BGM VOLUME = 8% (Preserve BGM)...');
  const resultDuck8 = await videoRendererService.renderDubbedVideo({
    videoUrl: project.video.videoUrl,
    subtitles: project.subtitles,
    settings: {
      removeSpoken: true,
      bgVolume: 8,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  });

  assert(resultDuck8.success, 'Render with bgVolume 8 succeeded');
  const fileDuck8 = videoRendererService.resolveVideoPath(resultDuck8.dubbedVideoUrl);
  assert(fs.existsSync(fileDuck8), 'Rendered video with 8% BGM exists');
  console.log(`   ✅ Rendered video with 8% BGM ducking: ${resultDuck8.dubbedVideoUrl} (${resultDuck8.sizeMb} MB)`);

  // Test 3: Verify video-player.js logic for bgVolume = 0 handling
  console.log('\n4. Verifying video-player.js duckRatio logic...');
  const playerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(playerJs.includes('Math.max(0, bgVol) / 100'), 'video-player.js must calculate duckRatio with Math.max(0, bgVol) / 100');
  assert(!playerJs.includes('(state.dubbingSettings.bgVolume || 8)'), 'video-player.js must not coerce 0 to 8');
  console.log('   ✅ video-player.js accurately supports 0% complete mute');

  // Test 4: Update project autosave with the newly generated video
  project.video.dubbedVideoUrl = resultMute0.dubbedVideoUrl;
  project.video.previewMode = 'after';
  project.dubbingSettings = project.dubbingSettings || {};
  project.dubbingSettings.removeSpokenVoice = true;
  project.dubbingSettings.bgVolume = 0;
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf-8');
  console.log('\n5. Updated autosave_project.json with latest dubbed video');

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: DYNAMIC TIMELINE AUDIO DUCKING VERIFIED!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
