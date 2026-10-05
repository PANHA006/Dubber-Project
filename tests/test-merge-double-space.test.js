const assert = require('assert');
const fs = require('fs');
const path = require('path');
const groqService = require('../src/services/groq.service');

async function testDoubleSpaceMerge() {
  console.log('--- [TEST] Sentence Merge with Double Space (No Slash /) ---');

  // Simulated Groq segments that are close together (< 0.20s gap) so they will be merged
  const mockGroqResponse = {
    task: 'transcribe',
    language: 'chinese',
    duration: 8.0,
    text: '面对一个精神病我  能有什么办法跟  他讲原则',
    segments: [
      { id: 0, start: 16.1, end: 17.5, text: '面对一个精神病我' },
      { id: 1, start: 17.6, end: 19.0, text: '能有什么办法跟' },
      { id: 2, start: 19.1, end: 20.5, text: '他讲原则' }
    ],
    words: []
  };

  const testWavPath = path.join(__dirname, 'temp_merge_test.wav');
  // 1s dummy wav
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
  fs.writeFileSync(testWavPath, buffer);

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => mockGroqResponse
  });

  try {
    const result = await groqService.transcribeAudio(testWavPath, {
      apiKey: 'gsk_mock',
      model: 'whisper-large-v3',
      maxPauseGap: 0.20,
      maxMergeLimit: 3
    });

    console.log('Result count:', result.length);
    console.log('Merged Text:', result[0].originalText);

    // Assert that text does NOT contain '/'
    assert(!result[0].originalText.includes('/'), 'Merged text must NOT contain "/"');

    // Assert that text contains double space '  '
    assert(result[0].originalText.includes('  '), 'Merged text MUST contain double space "  "');

    // Verify exact merged format
    const expected = '面对一个精神病我  能有什么办法跟  他讲原则';
    assert.strictEqual(result[0].originalText, expected, `Expected "${expected}", got "${result[0].originalText}"`);

    console.log('✅ TEST PASSED: Slashes "/" successfully replaced with double space "  "!');
  } finally {
    global.fetch = originalFetch;
    if (fs.existsSync(testWavPath)) fs.unlinkSync(testWavPath);
  }
}

testDoubleSpaceMerge().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
