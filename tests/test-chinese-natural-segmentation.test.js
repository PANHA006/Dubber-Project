const assert = require('assert');
const groqService = require('../src/services/groq.service');

async function testNaturalSegmentation() {
  console.log('--- [TEST] Chinese Natural Speech Segmentation (Pic 1 vs Pic 2 Fix) ---');

  // Simulated Groq API response mimicking the user's video (Pic 2)
  const mockGroqResponse = {
    task: 'transcribe',
    language: 'chinese',
    duration: 12.1,
    text: '看你就占一个字对对我占了一个字剩下的两个字你都占了你是不是活够了',
    segments: [
      { id: 0, start: 0.0, end: 2.15, text: '看你就占一个字' },
      { id: 1, start: 2.30, end: 4.10, text: '对对我占了一个字' },
      { id: 2, start: 4.50, end: 7.80, text: '剩下的两个字你都占了' },
      { id: 3, start: 8.20, end: 12.10, text: '你是不是活够了' }
    ],
    words: [
      // Words for segment 0
      { word: '看', start: 0.0, end: 0.3 },
      { word: '你', start: 0.3, end: 0.6 },
      { word: '就', start: 0.6, end: 0.9 },
      { word: '占', start: 0.9, end: 1.2 },
      { word: '一', start: 1.2, end: 1.5 },
      { word: '个', start: 1.5, end: 1.8 },
      { word: '字', start: 1.8, end: 2.15 },
      // Words for segment 1 (pause gap 0.15s)
      { word: '对', start: 2.30, end: 2.6 },
      { word: '对', start: 2.6, end: 2.9 },
      { word: '我', start: 2.9, end: 3.2 },
      { word: '占', start: 3.2, end: 3.5 },
      { word: '了', start: 3.5, end: 3.7 },
      { word: '一', start: 3.7, end: 3.9 },
      { word: '个', start: 3.9, end: 4.0 },
      { word: '字', start: 4.0, end: 4.10 },
      // Words for segment 2 (pause gap 0.40s)
      { word: '剩', start: 4.50, end: 4.9 },
      { word: '下', start: 4.9, end: 5.3 },
      { word: '的', start: 5.3, end: 5.7 },
      { word: '两', start: 5.7, end: 6.2 },
      { word: '个', start: 6.2, end: 6.7 },
      { word: '字', start: 6.7, end: 7.1 },
      { word: '你', start: 7.1, end: 7.3 },
      { word: '都', start: 7.3, end: 7.5 },
      { word: '占', start: 7.5, end: 7.7 },
      { word: '了', start: 7.7, end: 7.80 },
      // Words for segment 3 (pause gap 0.40s)
      { word: '你', start: 8.20, end: 8.8 },
      { word: '是', start: 8.8, end: 9.3 },
      { word: '不', start: 9.3, end: 9.8 },
      { word: '是', start: 9.8, end: 10.3 },
      { word: '活', start: 10.3, end: 11.0 },
      { word: '够', start: 11.0, end: 11.6 },
      { word: '了', start: 11.6, end: 12.10 }
    ]
  };

  // Process via the service's internal method using reflection / exported test
  // We can test groqService formatting directly
  const fs = require('fs');
  const path = require('path');
  const testWavPath = path.join(__dirname, 'temp_chinese_test.wav');
  
  // Dummy 12s wave header
  const sampleRate = 16000;
  const numSamples = sampleRate * 12;
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

  // Mock global fetch to return our simulated Groq response
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => mockGroqResponse
    };
  };

  try {
    const result = await groqService.transcribeAudio(testWavPath, {
      apiKey: 'gsk_mock_test',
      model: 'whisper-large-v3',
      maxPauseGap: 0.20,
      maxMergeLimit: 1 // No merging to see discrete segments
    });

    console.log(`Transcribed segments count: ${result.length}`);
    result.forEach((sub, i) => {
      console.log(`[Line ${sub.id}] [${sub.start} -> ${sub.end}] ${sub.originalText}`);
    });

    // Verification 1: Must NOT be 1 single line!
    assert(result.length >= 4, `Expected at least 4 discrete segments like Pic 2, got ${result.length}`);
    
    // Verification 2: Each segment text matches expected short lines
    assert(result[0].originalText.includes('看你就占一个字'), 'Line 1 text mismatch');
    assert(result[1].originalText.includes('对对我占了一个字'), 'Line 2 text mismatch');
    assert(result[2].originalText.includes('剩下的两个字你都占了'), 'Line 3 text mismatch');
    assert(result[3].originalText.includes('你是不是活够了'), 'Line 4 text mismatch');

    console.log('\n✅ TEST PASSED: Successfully split into discrete short subtitle lines (Picture 2 behavior)!');
  } finally {
    global.fetch = originalFetch;
    if (fs.existsSync(testWavPath)) fs.unlinkSync(testWavPath);
  }
}

testNaturalSegmentation().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
