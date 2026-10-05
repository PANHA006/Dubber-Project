/**
 * Verification Test for:
 * 1. Feature BGM extracts BGM_resolve from video.
 * 2. Feature Mute Voice operates on BGM_resolve with 100% silence (0x00) during speech intervals [startSec - 0.25s -> endSec + 0.25s].
 * 3. Outside speech intervals, BGM_resolve remains at 100% full volume.
 * 4. Renders final video with master voice track.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const pcmMuterService = require('../src/services/pcm-muter.service.js');
const videoRendererService = require('../src/services/video-renderer.service.js');

console.log('================================================================');
console.log('   🧪 E2E AUDIT: BGM_RESOLVE & MUTE VOICE (100% SILENCE ±0.25s)');
console.log('================================================================\n');

async function testBgmResolveAndMuteVoice() {
  const tempDir = path.join(__dirname, '../storage/voices');
  const videoDir = path.join(__dirname, '../storage/videos');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  const testAudioPath = path.join(tempDir, 'bgm_resolve_test_tone.wav');
  const testVideoPath = path.join(videoDir, 'bgm_resolve_test_video.mp4');

  // Create 4.0s test video with 1000Hz tone (representing original video with human voice + music)
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=4.0',
    '-c:a', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    testAudioPath
  ]);
  assert(fs.existsSync(testAudioPath), 'Audio fixture created');

  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=4:size=320x240:rate=25',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=4.0',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    testVideoPath
  ]);
  assert(fs.existsSync(testVideoPath), 'Video fixture created');

  // Subtitle from 1.00s to 2.50s
  const subtitles = [
    {
      id: 'sub-test-resolve-1',
      audioUrl: '/storage/voices/bgm_resolve_test_tone.wav',
      startSec: 1.00,
      endSec: 2.50
    }
  ];

  // STEP 1 & STEP 2: Extract BGM_resolve & apply Mute Voice (100% silence with pad ±0.25s)
  console.log('--- Step 1 & 2: Extract BGM_resolve and apply Mute Voice 100% ---');
  const mutedBgmPath = await pcmMuterService.extractAndMuteBackgroundAudio({
    videoPath: testVideoPath,
    subtitles,
    settings: {
      bgVolume: 0,
      padBefore: 0.25,
      padAfter: 0.25
    }
  });

  assert(fs.existsSync(mutedBgmPath), 'Muted BGM file exists on disk');
  const mutedBuffer = fs.readFileSync(mutedBgmPath);
  const info = pcmMuterService.parseWavHeader(mutedBuffer);

  function getPeakAtTime(buffer, sec) {
    const frame = Math.floor(sec * info.sampleRate);
    const offset = info.dataOffset + frame * info.frameSize;
    let peak = 0;
    for (let i = 0; i < 40; i += 2) {
      if (offset + i + 1 < buffer.length) {
        peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset + i)));
      }
    }
    return peak;
  }

  // 1. Outside speech (0.50s): Must be 100% full volume (> 1000)
  const peakBeforeSpeech = getPeakAtTime(mutedBuffer, 0.50);
  console.log(`Peak at 0.50s (Outside speech window): ${peakBeforeSpeech}`);
  assert(peakBeforeSpeech > 1000, 'Audio before speech must be 100% preserved');

  // 2. Inside padBefore (0.80s, between 0.75s and 1.00s): Must be 0
  const peakPadBefore = getPeakAtTime(mutedBuffer, 0.80);
  console.log(`Peak at 0.80s (Inside padBefore -0.25s): ${peakPadBefore}`);
  assert.strictEqual(peakPadBefore, 0, 'Original voice must be 100% muted at 0.80s');

  // 3. Middle of speech (1.80s): Must be 0 (100% silence)
  const peakSpeech = getPeakAtTime(mutedBuffer, 1.80);
  console.log(`Peak at 1.80s (During AI speech): ${peakSpeech}`);
  assert.strictEqual(peakSpeech, 0, 'Original voice must be 100% muted during speech');

  // 4. Inside padAfter (2.65s, between 2.50s and 2.75s): Must be 0
  const peakPadAfter = getPeakAtTime(mutedBuffer, 2.65);
  console.log(`Peak at 2.65s (Inside padAfter +0.25s): ${peakPadAfter}`);
  assert.strictEqual(peakPadAfter, 0, 'Original voice must be 100% muted at 2.65s');

  // 5. Outside speech (3.00s, after 2.75s): Must be 100% full volume (> 1000)
  const peakAfterSpeech = getPeakAtTime(mutedBuffer, 3.00);
  console.log(`Peak at 3.00s (Outside speech window): ${peakAfterSpeech}`);
  assert(peakAfterSpeech > 1000, 'Audio after speech must be 100% preserved');

  console.log('✅ PASS: Speech intervals [0.75s -> 2.75s] are 100% silent, outside is 100% full volume!\n');

  // STEP 3: Full Video Render Dubbing Test
  console.log('--- Step 3: Full Video Render Dubbing with BGM_resolve & Mute Voice ---');
  const renderRes = await videoRendererService.renderDubbedVideo({
    videoUrl: '/storage/videos/bgm_resolve_test_video.mp4',
    subtitles,
    settings: {
      removeSpoken: true,
      bgVolume: 0,
      videoVolume: 1.0,
      dubVolume: 1.0
    }
  });

  assert(renderRes.success, 'Video render must succeed');
  const renderedPath = videoRendererService.resolveVideoPath(renderRes.dubbedVideoUrl);
  assert(fs.existsSync(renderedPath), 'Rendered video exists on disk');
  console.log(`✅ PASS: Rendered video created successfully: ${renderRes.filename}\n`);

  // Cleanup
  try { if (fs.existsSync(testAudioPath)) fs.unlinkSync(testAudioPath); } catch (_) {}
  try { if (fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath); } catch (_) {}
  try { if (fs.existsSync(mutedBgmPath)) fs.unlinkSync(mutedBgmPath); } catch (_) {}
  try { if (fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath); } catch (_) {}

  console.log('================================================================');
  console.log('   🎉 BGM_RESOLVE & MUTE VOICE (100% SILENCE) VERIFIED 100%!');
  console.log('================================================================\n');
}

testBgmResolveAndMuteVoice().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
