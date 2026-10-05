const app = require('../src/app');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

async function testSinglePassTranscription() {
  console.log('================================================================');
  console.log('   🎙️ TESTING SINGLE-PASS FASTER-WHISPER TRANSCRIPTION');
  console.log('================================================================\n');

  const PORT = 5129;
  const server = app.listen(PORT, async () => {
    try {
      // Find a sample audio file or create dummy wav for test
      const sampleAudioPath = path.join(__dirname, 'sample_test.wav');
      
      // Generate a small valid 1-second 16kHz mono WAV file
      const sampleRate = 16000;
      const numSamples = sampleRate * 1; // 1 second
      const buffer = Buffer.alloc(44 + numSamples * 2);
      
      // RIFF header
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + numSamples * 2, 4);
      buffer.write('WAVE', 8);
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16); // PCM format chunk size
      buffer.writeUInt16LE(1, 20);  // Format: PCM
      buffer.writeUInt16LE(1, 22);  // Channels: 1 (Mono)
      buffer.writeUInt32LE(sampleRate, 24); // Sample rate
      buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
      buffer.writeUInt16LE(2, 32); // Block align
      buffer.writeUInt16LE(16, 34); // Bits per sample
      buffer.write('data', 36);
      buffer.writeUInt32LE(numSamples * 2, 40);
      // Samples (silence)
      buffer.fill(0, 44);

      fs.writeFileSync(sampleAudioPath, buffer);
      console.log(`[TEST] Generated sample 16kHz mono WAV: ${sampleAudioPath}`);

      const formData = new FormData();
      const fileBlob = new Blob([fs.readFileSync(sampleAudioPath)], { type: 'audio/wav' });
      formData.append('audio', fileBlob, 'sample_test.wav');

      console.log(`[TEST] Sending POST http://localhost:${PORT}/api/transcribe (Single-Pass)...`);
      const startTime = Date.now();

      const response = await fetch(`http://localhost:${PORT}/api/transcribe`, {
        method: 'POST',
        body: formData
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[TEST] Response status: ${response.status} (${elapsed}s)`);

      const json = await response.json();
      console.log('[TEST] Response body:', JSON.stringify(json, null, 2));

      assert.strictEqual(response.status, 200, 'HTTP status must be 200');
      assert.strictEqual(json.success, true, 'API response success must be true');
      assert(Array.isArray(json.data), 'API data must be an array of subtitle segments');

      console.log('\n================================================================');
      console.log('🎉 SINGLE-PASS TRANSCRIPTION TEST PASSED SUCCESSFULLY!');
      console.log('================================================================\n');

      // Cleanup
      if (fs.existsSync(sampleAudioPath)) {
        fs.unlinkSync(sampleAudioPath);
      }
      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ Single-pass transcription test failed:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

testSinglePassTranscription();
