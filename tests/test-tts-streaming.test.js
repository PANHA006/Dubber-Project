const ttsService = require('../src/services/tts.service');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('Testing TTS Service with Khmer audio generation and streaming progress...');

  const progressEvents = [];
  const items = [
    {
      id: 'test_sub_1',
      khmerText: 'សួស្តីបងប្អូនទាំងអស់គ្នា',
      voice: 'Piseth (Male)',
      targetDuration: 2.0
    },
    {
      id: 'test_sub_2',
      khmerText: 'សូមស្វាគមន៍មកកាន់កម្មវិធីរបស់យើង',
      voice: 'Sreymom (Female)',
      targetDuration: 2.5
    }
  ];

  const result = await ttsService.generateVoices(items, (progress) => {
    progressEvents.push(progress);
    console.log(`[ON_PROGRESS] Item ${progress.current}/${progress.total} (${progress.status}) - Voice: ${progress.voice} - Speed: ${progress.speed}x`);
  });

  console.log('TTS Result:', {
    success: result.success,
    count: result.count,
    total: items.length
  });

  assert.strictEqual(result.success, true, 'Result success should be true');
  assert.strictEqual(result.count, 2, 'Should have generated 2 voice files');
  assert.strictEqual(progressEvents.length, 2, 'Should receive 2 progress callback events');

  for (const itemRes of result.results) {
    assert.strictEqual(itemRes.success, true, `Item ${itemRes.id} should succeed`);
    const filePath = path.join(ttsService.storageDir, itemRes.filename);
    assert.ok(fs.existsSync(filePath), `Generated file ${itemRes.filename} must exist`);
    const size = fs.statSync(filePath).size;
    assert.ok(size > 1000, `Generated file size must be > 1000 bytes, got ${size}`);
    console.log(`✅ Verified audio file ${itemRes.filename} (${size} bytes, ${itemRes.duration}s, speed: ${itemRes.speedApplied}x)`);
    // Cleanup test audio
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  console.log('🎉 ALL TTS TESTS PASSED SUCCESSFULLY!');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
