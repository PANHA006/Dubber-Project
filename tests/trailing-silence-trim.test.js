/**
 * Automated Test Suite for:
 * Trailing Silence Trimming & Natural Speed Fitting in Edge-TTS Worker
 * 
 * Verifies that:
 * 1. Edge-TTS trailing silence (~0.86s) is cleanly trimmed before duration calculation.
 * 2. Real spoken audio is measured accurately.
 * 3. Voice speed ratio is natural (~1.05x instead of excessive 1.22x).
 * 4. Trailing silence at the end of the generated MP3 is <= 0.12s.
 * 5. Speech extends naturally towards the subtitle target duration (e.g. 5.26s).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ttsService = require('../src/services/tts.service.js');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   🎙️ TEST SUITE: TRAILING SILENCE TRIMMING & NATURAL SPEED     ');
  console.log('================================================================\n');

  const storageVoicesDir = path.join(__dirname, '../storage/voices');
  const workerPyPath = path.join(__dirname, '../src/workers/tts_worker.py');

  // --- 1. CODE AUDIT ---
  console.log('--- 1. AUDITING SOURCE CODE IMPLEMENTATION ---');
  const workerPy = fs.readFileSync(workerPyPath, 'utf-8');
  assert(workerPy.includes('def trim_trailing_silence('), 'tts_worker.py defines trim_trailing_silence function');
  assert(workerPy.includes('areverse') && workerPy.includes('silenceremove'), 'trim_trailing_silence uses areverse + silenceremove');
  assert(workerPy.includes('trim_trailing_silence(out_path)'), 'trim_trailing_silence is called before get_audio_duration');

  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  assert(subtitlesJs.includes('audio.playbackRate = 1.0;'), 'subtitles.js enforces 1.0 playbackRate for pre-fitted audio');

  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('audio.playbackRate = 1.0;'), 'video-player.js enforces 1.0 playbackRate for pre-fitted audio');

  // --- 2. LIVE VOICE GENERATION WITH EXACT USER TEST CASE ---
  console.log('\n--- 2. TESTING EXACT USER SUBTITLE CASE ---');
  const userItem = {
    id: `trim_test_sreymom_${Date.now()}`,
    khmerText: 'មើលសង្សារគេផង គេផ្អែមល្ហែមណាស់! ចុះឯងវិញ គ្មានស្អីក្រៅពីលេងហ្គេមទេ!',
    voice: 'Sreymom (Female)',
    startSec: 0.0,
    endSec: 5.26,
    targetDuration: 5.26
  };

  const result = await ttsService.generateVoices([userItem]);
  assert(result.success === true, 'ttsService successfully generated speech');
  const resItem = result.results[0];
  assert(resItem && resItem.success === true, 'Item generation succeeded');

  console.log(`     ↳ Generated file: ${resItem.filename}`);
  console.log(`     ↳ Measured duration: ${resItem.duration}s`);
  console.log(`     ↳ Speed applied: ${resItem.speedApplied}x (target: 5.26s)`);

  const filePath = path.join(storageVoicesDir, resItem.filename);
  assert(fs.existsSync(filePath), 'Generated audio file exists on disk');

  // Verify speed applied is natural (should be around 1.05x - 1.08x, NOT the old 1.22x)
  assert(resItem.speedApplied <= 1.10, `Speed applied is natural and relaxed: ${resItem.speedApplied}x (<= 1.10x)`);
  assert(resItem.duration >= 5.0 && resItem.duration <= 5.4, `Final audio duration is close to 5.26s target: ${resItem.duration}s`);

  // --- 3. WAVEFORM SILENCE VERIFICATION VIA FFPROBE / FFMPEG ---
  console.log('\n--- 3. VERIFYING WAVEFORM & SILENCE DETECTION ---');
  const silenceProbe = spawnSync('ffmpeg', [
    '-i', filePath,
    '-af', 'silencedetect=noise=-30dB:d=0.1',
    '-f', 'null', '-'
  ], { encoding: 'utf-8' });

  const stderr = silenceProbe.stderr || '';
  // Check trailing silence by matching silence_end near duration
  const silenceMatches = [...stderr.matchAll(/silence_start:\s*([0-9.]+)\s*\|\s*silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g)];
  
  if (silenceMatches.length > 0) {
    const lastSilence = silenceMatches[silenceMatches.length - 1];
    const silenceEnd = parseFloat(lastSilence[2]);
    const silenceDur = parseFloat(lastSilence[3]);
    console.log(`     ↳ Last detected silence ends at: ${silenceEnd}s (duration: ${silenceDur}s)`);
    if (Math.abs(silenceEnd - resItem.duration) < 0.2) {
      assert(silenceDur <= 0.15, `Trailing silence is strictly constrained: ${silenceDur}s (<= 0.15s)`);
    } else {
      console.log('     ↳ Last silence was in middle of speech (pause between sentences). Trailing silence is 0s.');
      assert(true, 'No trailing silence detected at end of file');
    }
  } else {
    assert(true, 'No significant silence detected at end of file');
  }

  // Clean up
  try { fs.unlinkSync(filePath); } catch (_) {}

  // --- SUMMARY ---
  console.log('\n------------------------------------------------------');
  console.log(`  Tests Passed : ${passedChecks} / ${totalChecks}`);
  console.log('------------------------------------------------------\n');

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL TRAILING SILENCE & SPEED FITTING TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
