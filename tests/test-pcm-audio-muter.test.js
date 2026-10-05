const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const pcmMuterService = require('../src/services/pcm-muter.service.js');

console.log('================================================================');
console.log('   🧪 TEST: PCM BYTE-LEVEL AUDIO MUTING SERVICE');
console.log('================================================================\n');

async function testPcmMuter() {
  const tempDir = path.join(__dirname, '../storage/voices');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const testWavPath = path.join(tempDir, 'test_pcm_sine.wav');

  // 1. Generate 3-second 44.1kHz stereo sine wave
  console.log('--- 1. Generating 3-second stereo 44.1kHz PCM WAV fixture ---');
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=3.0',
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    testWavPath
  ]);
  assert(fs.existsSync(testWavPath), 'Test WAV exists');

  const buf = fs.readFileSync(testWavPath);
  const info = pcmMuterService.parseWavHeader(buf);
  console.log('Parsed WAV Info:', {
    channels: info.numChannels,
    sampleRate: info.sampleRate,
    bitsPerSample: info.bitsPerSample,
    duration: info.duration.toFixed(2) + 's',
    dataOffset: info.dataOffset,
    dataSize: info.dataSize
  });

  assert.strictEqual(info.numChannels, 2, 'Must be stereo');
  assert.strictEqual(info.sampleRate, 44100, 'Must be 44.1kHz');
  assert.strictEqual(info.bitsPerSample, 16, 'Must be 16-bit');
  console.log('✅ PASS: WAV Header parsed accurately!');

  // 2. Mute speech interval [1.0s -> 2.0s] with bgVolumePct = 0 (Total 0x00 silence)
  console.log('\n--- 2. Muting speech interval [1.0s -> 2.0s] (100% Silence 0x00) ---');
  // With padBefore=0.2 and padAfter=0.2, target mute is [0.8s -> 2.2s]
  pcmMuterService.mutePcmBuffer(buf, [
    { startSec: 1.0, endSec: 2.0 }
  ], { padBefore: 0.20, padAfter: 0.20, bgVolumePct: 0 });

  // 3. Verify bytes outside interval [0.45s -> 0.55s] have non-zero audio
  const frameSize = info.frameSize;
  const beforeFrame = Math.floor(0.5001 * info.sampleRate);
  const beforeOffset = info.dataOffset + beforeFrame * frameSize;
  let maxBefore = 0;
  for (let i = 0; i < 20; i += 2) {
    maxBefore = Math.max(maxBefore, Math.abs(buf.readInt16LE(beforeOffset + i)));
  }
  console.log(`Peak audio sample around 0.5s (should be untouched): ${maxBefore}`);
  assert(maxBefore > 100, 'Audio before speech must be preserved non-zero');

  // 4. Verify bytes inside interval [1.2s -> 1.8s] are ALL EXACTLY 0 (pure silence 0x00)
  const insideFrame = Math.floor(1.5 * info.sampleRate);
  const insideOffset = info.dataOffset + insideFrame * frameSize;
  let maxInside = 0;
  for (let i = 0; i < 400; i += 2) {
    maxInside = Math.max(maxInside, Math.abs(buf.readInt16LE(insideOffset + i)));
  }
  console.log(`Max audio sample around 1.5s (should be exactly 0): ${maxInside}`);
  assert.strictEqual(maxInside, 0, 'Audio inside speech range must be exactly 0x00 (silence)');

  // 5. Verify bytes after interval [2.6s] have non-zero audio
  const afterFrame = Math.floor(2.6001 * info.sampleRate);
  const afterOffset = info.dataOffset + afterFrame * frameSize;
  let maxAfter = 0;
  for (let i = 0; i < 20; i += 2) {
    maxAfter = Math.max(maxAfter, Math.abs(buf.readInt16LE(afterOffset + i)));
  }
  console.log(`Peak audio sample around 2.6s (should be untouched): ${maxAfter}`);
  assert(maxAfter > 100, 'Audio after speech must be preserved non-zero');

  // 6. Test with 270 intervals performance
  console.log('\n--- 3. Performance Test: 270 Subtitle Intervals on 20-minute Buffer ---');
  // Create a 20-minute virtual buffer
  const frames20m = 44100 * 60 * 20;
  const size20m = info.dataOffset + frames20m * frameSize;
  console.log(`Allocating 20-minute audio buffer (${(size20m / (1024 * 1024)).toFixed(1)} MB)...`);
  const bigBuffer = Buffer.alloc(size20m);
  buf.copy(bigBuffer, 0, 0, info.dataOffset); // copy header
  bigBuffer.writeUInt32LE(frames20m * frameSize, info.dataOffset - 4); // update data chunk size

  const subs270 = Array.from({ length: 270 }, (_, i) => ({
    startSec: i * 4.0,
    endSec: i * 4.0 + 2.5
  }));

  const t0 = Date.now();
  pcmMuterService.mutePcmBuffer(bigBuffer, subs270, { padBefore: 0.2, padAfter: 0.2, bgVolumePct: 0 });
  const elapsedMs = Date.now() - t0;
  console.log(`✅ Processed 270 subtitle intervals across 20-minute audio in ${elapsedMs}ms!`);
  assert(elapsedMs < 500, 'Processing 20-minute audio must take less than 500ms');

  // Cleanup
  try { if (fs.existsSync(testWavPath)) fs.unlinkSync(testWavPath); } catch (_) {}

  console.log('\n================================================================');
  console.log('   🎉 ALL PCM BYTE MUTER TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

testPcmMuter().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
