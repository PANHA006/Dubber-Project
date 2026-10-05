const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const groqService = require('../src/services/groq.service');
require('dotenv').config();

async function testLargeAudioAutoCompression() {
  console.log('--- [TEST] Large Audio Auto-Compression (> 20 MB) for Groq Cloud ---');

  // Generate a ~22 MB WAV file (e.g. ~11.5 minutes of 16kHz 16-bit mono PCM: 11.5 * 60 * 32000 = ~22.08 MB)
  const durationSec = 11.5 * 60; // 690 seconds
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const totalFileSize = 44 + dataSize;
  const totalFileSizeMb = (totalFileSize / (1024 * 1024)).toFixed(2);

  console.log(`Generating simulated large audio file (${totalFileSizeMb} MB)...`);
  const largeWavPath = path.join(os.tmpdir(), `test_large_audio_${Date.now()}.wav`);

  // Write valid WAV header
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const writeStream = fs.createWriteStream(largeWavPath);
  writeStream.write(header);

  // Write silent / low-amplitude chunks in chunks of 512KB to avoid memory blowout
  const chunkSamples = 16000 * 5; // 5 seconds per chunk
  const chunkBuffer = Buffer.alloc(chunkSamples * 2);
  let written = 0;
  while (written < dataSize) {
    const toWrite = Math.min(chunkBuffer.length, dataSize - written);
    writeStream.write(chunkBuffer.subarray(0, toWrite));
    written += toWrite;
  }
  await new Promise(r => writeStream.end(r));

  const actualSizeMb = (fs.statSync(largeWavPath).size / (1024 * 1024)).toFixed(2);
  console.log(`Created large WAV on disk: ${actualSizeMb} MB (> 20 MB)`);
  assert(fs.statSync(largeWavPath).size > 20 * 1024 * 1024, 'File must be > 20MB');

  try {
    const t0 = Date.now();
    console.log('Sending large file to groqService.transcribeAudio...');
    const result = await groqService.transcribeAudio(largeWavPath, {
      apiKey: process.env.GROQ_API_KEY,
      model: 'whisper-large-v3'
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`✅ SUCCESS! Large audio (${actualSizeMb} MB) transcribed without 413 error in ${elapsed}s!`);
    console.log(`Subtitles generated: ${result.length}`);
    assert(Array.isArray(result), 'Result must be an array');
  } finally {
    if (fs.existsSync(largeWavPath)) fs.unlinkSync(largeWavPath);
  }

  console.log('\n🎉 LARGE AUDIO AUTO-COMPRESSION TEST PASSED 100%!');
}

testLargeAudioAutoCompression().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
