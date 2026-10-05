const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

async function testMulterUploadToGroq() {
  console.log('Testing upload with extension-less temp file (mimicking Multer)...');

  // 1. Create a 1s 16kHz sine wav buffer
  const sampleRate = 16000;
  const numSamples = sampleRate * 1;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  // 2. Write to a file WITHOUT extension (exactly what Multer does)
  const noExtPath = path.join(os.tmpdir(), `test_multer_no_ext_${Date.now()}`);
  fs.writeFileSync(noExtPath, buffer);

  try {
    const groqService = require('../src/services/groq.service');
    require('dotenv').config();

    console.log('Calling groqService.transcribeAudio with no-extension file:', path.basename(noExtPath));
    const result = await groqService.transcribeAudio(noExtPath, {
      apiKey: process.env.GROQ_API_KEY,
      model: 'whisper-large-v3'
    });

    console.log('✅ Success! Groq accepted the file and returned', result.length, 'subtitles');
    assert(Array.isArray(result), 'Result must be an array');
  } finally {
    if (fs.existsSync(noExtPath)) fs.unlinkSync(noExtPath);
  }

  // 3. Test HTTP POST /api/transcribe end-to-end
  console.log('\nTesting HTTP POST /api/transcribe via fetch with model="groq-whisper-large-v3"...');
  const formData = new FormData();
  formData.append('audio', new Blob([buffer], { type: 'audio/wav' }), 'extracted_audio.wav');
  formData.append('model', 'groq-whisper-large-v3');

  const res = await fetch('http://localhost:5000/api/transcribe', {
    method: 'POST',
    body: formData
  });

  const json = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Response Success:', json.success);
  if (!json.success) {
    console.error('API Error:', json.message);
  }
  assert.strictEqual(res.status, 200, 'Expected HTTP 200');
  assert.strictEqual(json.success, true, 'Expected success: true');
  console.log('✅ End-to-end POST /api/transcribe with Groq Large-v3 passed perfectly!');
}

testMulterUploadToGroq().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
