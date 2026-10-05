const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runComprehensiveReview() {
  console.log('=================================================================');
  console.log('   🚀 COMPREHENSIVE SYSTEM REVIEW & END-TO-END PIPELINE TEST');
  console.log('=================================================================');

  // Step 1: Health & Status Check
  console.log('\n--- Step 1: Backend Health & Status API ---');
  const healthRes = await fetch('http://localhost:5000/api/health');
  assert.strictEqual(healthRes.status, 200, 'Health check should be 200');
  const healthJson = await healthRes.json();
  console.log('✅ GET /api/health: OK -', healthJson.message);

  const statusRes = await fetch('http://localhost:5000/api/status');
  assert.strictEqual(statusRes.status, 200, 'Status check should be 200');
  const statusJson = await statusRes.json();
  console.log('✅ GET /api/status: OK - hasGroqKey:', statusJson.data.hasGroqKey);
  assert(statusJson.data.hasGroqKey === true, 'Server should detect GROQ_API_KEY from .env');

  // Step 2: Generate 3-second test WAV audio with 2 distinct tone bursts (simulating 2 speech segments)
  console.log('\n--- Step 2: Audio Synthesis for Live Groq Whisper Test ---');
  const sampleRate = 16000;
  const numSamples = sampleRate * 3;
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

  // Burst 1 (0.2s - 1.2s), Silence (1.2s - 1.8s), Burst 2 (1.8s - 2.8s)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if ((t >= 0.2 && t <= 1.2) || (t >= 1.8 && t <= 2.8)) {
      sample = Math.floor(12000 * Math.sin(2 * Math.PI * 440 * t));
    }
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  console.log(`Synthesized WAV buffer: ${(buffer.length / 1024).toFixed(1)} KB`);

  // Step 3: Live End-to-End POST /api/transcribe with Groq Large-v3
  console.log('\n--- Step 3: POST /api/transcribe (Groq Whisper Large-v3) ---');
  const formData = new FormData();
  formData.append('audio', new Blob([buffer], { type: 'audio/wav' }), 'sample_video_audio.wav');
  formData.append('model', 'groq-whisper-large-v3');

  const t0 = Date.now();
  const transcribeRes = await fetch('http://localhost:5000/api/transcribe', {
    method: 'POST',
    body: formData
  });

  const transcribeTime = ((Date.now() - t0) / 1000).toFixed(2);
  const transcribeJson = await transcribeRes.json();

  assert.strictEqual(transcribeRes.status, 200, 'Expected HTTP 200 from transcribe');
  assert.strictEqual(transcribeJson.success, true, 'Expected success: true');
  assert(Array.isArray(transcribeJson.data), 'Transcribe data must be array');

  console.log(`✅ Transcription completed in ${transcribeTime}s!`);
  console.log(`Output segments count: ${transcribeJson.data.length}`);
  transcribeJson.data.forEach((sub, i) => {
    console.log(`   [Row ${sub.id}] [${sub.start} -> ${sub.end}] text: "${sub.originalText}"`);
    assert(sub.start && sub.end, 'Segment must have valid start and end timestamps');
    assert(typeof sub.startSec === 'number', 'Segment startSec must be a number');
    assert(typeof sub.endSec === 'number', 'Segment endSec must be a number');
  });

  // Step 4: Verification of Segmentation Logic with Chinese Speech (Pic 1 vs Pic 2 case)
  console.log('\n--- Step 4: Chinese Natural Segmentation Logic Verification ---');
  const groqService = require('../src/services/groq.service');
  const chineseMockPath = path.join(__dirname, 'temp_chinese_review.wav');
  fs.writeFileSync(chineseMockPath, buffer);

  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (typeof url === 'string' && url.includes('api.groq.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
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
          words: []
        })
      };
    }
    return originalFetch(url, opts);
  };

  try {
    const chineseSubs = await groqService.transcribeAudio(chineseMockPath, {
      apiKey: process.env.GROQ_API_KEY,
      model: 'whisper-large-v3',
      maxPauseGap: 0.20,
      maxMergeLimit: 1
    });

    console.log(`Chinese test segments produced: ${chineseSubs.length} discrete rows`);
    assert(chineseSubs.length === 4, `Expected exactly 4 rows, got ${chineseSubs.length}`);
    assert(chineseSubs[0].originalText === '看你就占一个字', 'Row 1 mismatch');
    assert(chineseSubs[1].originalText === '对对我占了一个字', 'Row 2 mismatch');
    assert(chineseSubs[2].originalText === '剩下的两个字你都占了', 'Row 3 mismatch');
    assert(chineseSubs[3].originalText === '你是不是活够了', 'Row 4 mismatch');
    console.log('✅ Chinese Natural Segmentation: 100% Verified (Matches Picture 2 layout)');
  } finally {
    global.fetch = originalFetch;
    if (fs.existsSync(chineseMockPath)) fs.unlinkSync(chineseMockPath);
  }

  // Step 5: Test Downstream Gemini AI Translation with these segmented lines
  console.log('\n--- Step 5: Testing Gemini AI Translation (/api/translate) ---');
  const sampleSubtitles = [
    { id: 1, start: '00:00:00,000', end: '00:00:02,150', startSec: 0.0, endSec: 2.15, originalText: '看你就占一个字', khmerText: '' },
    { id: 2, start: '00:00:02,300', end: '00:00:04,100', startSec: 2.3, endSec: 4.1, originalText: '对对我占了一个字', khmerText: '' }
  ];

  const transRes = await fetch('http://localhost:5000/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtitles: sampleSubtitles })
  });

  assert.strictEqual(transRes.status, 200, 'Translation endpoint should return 200');
  const transJson = await transRes.json();
  assert.strictEqual(transJson.success, true, 'Translation should succeed');
  assert(Array.isArray(transJson.data), 'Translation data should be array');
  console.log('✅ Translation completed successfully:');
  transJson.data.forEach(item => {
    console.log(`   Line ${item.id}: [${item.originalText}] -> Khmer: "${item.khmerText}"`);
    assert(item.khmerText && item.khmerText.trim().length > 0, 'Khmer text must not be empty');
  });

  // Step 6: Test Downstream Edge TTS Khmer Voice Generation
  console.log('\n--- Step 6: Testing Microsoft Edge TTS Voice Generation (/api/generate-voice) ---');
  const firstKhmerLine = transJson.data[0];
  const ttsRes = await fetch('http://localhost:5000/api/generate-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 1,
          text: firstKhmerLine.khmerText || 'សួស្តីបាទ',
          voice: 'km-KH-PisethNeural',
          targetDuration: 2.15
        }
      ]
    })
  });

  assert.strictEqual(ttsRes.status, 200, 'TTS should return 200');
  const ttsJson = await ttsRes.json();
  assert.strictEqual(ttsJson.success, true, 'TTS should succeed');
  assert(Array.isArray(ttsJson.data) && ttsJson.data.length > 0, 'TTS must return results in data');
  console.log('✅ Khmer Voice generated successfully!');
  console.log(`   Audio URL: ${ttsJson.data[0].audioUrl} (Duration: ${ttsJson.data[0].duration}s)`);

  console.log('\n=================================================================');
  console.log('   🎉 ALL 6 COMPREHENSIVE PIPELINE TESTS PASSED 100%!');
  console.log('=================================================================');
}

runComprehensiveReview().catch(err => {
  console.error('\n❌ Comprehensive Review Failed:', err);
  process.exit(1);
});
