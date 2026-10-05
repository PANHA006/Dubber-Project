/**
 * Verification Test for Solution 3: Enhanced Buffer Padding (padBefore = 0.25s & padAfter = 0.25s)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const pcmMuterService = require('../src/services/pcm-muter.service.js');
const videoRendererService = require('../src/services/video-renderer.service.js');

console.log('================================================================');
console.log('   🧪 AUDIT: BUFFER PADDING (padBefore = 0.25s & padAfter = 0.25s)');
console.log('================================================================\n');

async function testBufferPadding() {
  const tempDir = path.join(__dirname, '../storage/voices');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const testAudioPath = path.join(tempDir, 'padding_test_tone.wav');

  // 1. Generate 4.0s sine wave 1000Hz stereo 44.1kHz
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

  const origBuffer = fs.readFileSync(testAudioPath);
  const info = pcmMuterService.parseWavHeader(origBuffer);

  // Subtitle from 1.00s to 3.00s.
  // With padBefore = 0.25s and padAfter = 0.25s:
  // Muting range MUST be [0.75s -> 3.25s]!
  const testSubtitles = [{ startSec: 1.00, endSec: 3.00 }];

  const buf = Buffer.from(origBuffer);
  pcmMuterService.mutePcmBuffer(buf, testSubtitles, { bgVolumePct: 0 });

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

  // 1. Point at 0.70s (outside padding window, before 0.75s) -> Must be UNTOUCHED (peak > 1000)
  const peakAt0_70 = getPeakAtTime(buf, 0.70);
  console.log(`Peak at 0.70s (Untouched outside buffer): ${peakAt0_70}`);
  assert(peakAt0_70 > 1000, 'Audio before 0.75s must be preserved');

  // 2. Point at 0.80s (inside padBefore 0.25s, between 0.75s and 1.00s) -> Must be MUTED (0)
  const peakAt0_80 = getPeakAtTime(buf, 0.80);
  console.log(`Peak at 0.80s (Inside padBefore buffer [0.75s - 1.00s]): ${peakAt0_80}`);
  assert.strictEqual(peakAt0_80, 0, 'Audio at 0.80s must be completely muted by padBefore');

  // 3. Point at 2.00s (middle of dialogue) -> Must be MUTED (0)
  const peakAt2_00 = getPeakAtTime(buf, 2.00);
  console.log(`Peak at 2.00s (Dialogue center): ${peakAt2_00}`);
  assert.strictEqual(peakAt2_00, 0, 'Audio during dialogue must be completely muted');

  // 4. Point at 3.20s (inside padAfter 0.25s, between 3.00s and 3.25s) -> Must be MUTED (0)
  const peakAt3_20 = getPeakAtTime(buf, 3.20);
  console.log(`Peak at 3.20s (Inside padAfter buffer [3.00s - 3.25s]): ${peakAt3_20}`);
  assert.strictEqual(peakAt3_20, 0, 'Audio at 3.20s must be completely muted by padAfter');

  // 5. Point at 3.35s (outside padding window, after 3.25s) -> Must be UNTOUCHED (peak > 1000)
  const peakAt3_35 = getPeakAtTime(buf, 3.35);
  console.log(`Peak at 3.35s (Untouched outside buffer): ${peakAt3_35}`);
  assert(peakAt3_35 > 1000, 'Audio after 3.25s must be preserved');

  // Cleanup
  try { if (fs.existsSync(testAudioPath)) fs.unlinkSync(testAudioPath); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 BUFFER PADDING AUDIT: 0.25s BEFORE & AFTER PASSED 100%!');
  console.log('================================================================\n');
}

testBufferPadding().catch(err => {
  console.error('❌ BUFFER PADDING AUDIT FAILED:', err);
  process.exit(1);
});
