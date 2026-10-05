/**
 * Automated Test: 2-Separate-Step Translation Pipeline (Chinese -> English -> Khmer)
 * Tests Step 1 (Chinese -> English), Step 2 (English -> Khmer), and Full Pipeline.
 */
const assert = require('assert');
const geminiService = require('../src/services/gemini.service.js');

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTING 2-SEPARATE-STEP TRANSLATION PIPELINE (2 QUOTAS)');
  console.log('================================================================\n');

  const testSubtitles = [
    {
      id: 'sub-1',
      start: '00:00:00,000',
      end: '00:00:05,260',
      startSec: 0,
      endSec: 5.26,
      originalText: '你看看别人的男朋友都是小乃哥 / 你再看看你 / 就站一个字 走'
    },
    {
      id: 'sub-2',
      start: '00:00:05,260',
      end: '00:00:10,040',
      startSec: 5.26,
      endSec: 10.04,
      originalText: '对对对 我就站了一个字 / 剩下的两个字你都站'
    },
    {
      id: 'sub-3',
      start: '00:00:10,680',
      end: '00:00:12,800',
      startSec: 10.68,
      endSec: 12.8,
      originalText: '你是不是活够了'
    }
  ];

  // 1. Test STEP 1: Chinese -> English (Quota 1)
  console.log('--- 1. Testing Step 1: Chinese -> English (Quota 1) ---');
  const step1Results = await geminiService.translateChineseToEnglish(testSubtitles);
  assert(Array.isArray(step1Results), 'Step 1 must return an array');
  assert.strictEqual(step1Results.length, 3, 'Step 1 must return 3 items');
  
  step1Results.forEach((item, idx) => {
    console.log(`  [Line ${idx + 1}] Original: ${item.originalText}`);
    console.log(`         English:  ${item.englishText}`);
    assert(item.englishText && item.englishText.length > 0, `Line ${idx + 1} must have englishText`);
  });
  console.log('  ✅ [PASS] Step 1 successfully decoded Chinese dialogue to English.\n');

  // 2. Test STEP 2: English -> Spoken Cinema Khmer (Quota 2)
  console.log('--- 2. Testing Step 2: English -> Spoken Cinema Khmer (Quota 2) ---');
  const step2Results = await geminiService.translateEnglishToKhmer(step1Results);
  assert(Array.isArray(step2Results), 'Step 2 must return an array');
  assert.strictEqual(step2Results.length, 3, 'Step 2 must return 3 items');

  step2Results.forEach((item, idx) => {
    console.log(`  [Line ${idx + 1}] English: ${item.englishText}`);
    console.log(`         Khmer:   ${item.khmerText}`);
    assert(item.khmerText && item.khmerText.length > 0, `Line ${idx + 1} must have khmerText`);
  });

  // Verify Guardrail: NEVER output "ចាស់ៗ"
  const line2Khmer = step2Results[1].khmerText;
  assert(!line2Khmer.includes('ចាស់ៗ'), 'Must NEVER output "ចាស់ៗ" for agreement!');
  console.log('  ✅ [PASS] No "ចាស់ៗ" hallucination detected!');

  // Verify Guardrail: Line 3 must NOT have broken particle "ហំ?"
  const line3Khmer = step2Results[2].khmerText;
  assert(!line3Khmer.includes('ហំ?'), 'Must NOT have broken particle "ហំ?"');
  console.log('  ✅ [PASS] Line 3 has clean cinema confrontational phrasing.');

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: 2-SEPARATE-STEP PIPELINE VERIFIED 100%!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
