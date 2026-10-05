/**
 * Test: Permanent Natural Spoken Cinema Khmer Translation with Banter & Lexicon Guardrails
 */
const assert = require('assert');
const geminiService = require('../src/services/gemini.service.js');

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTING PERMANENT NATURAL SPOKEN CINEMA KHMER TRANSLATION');
  console.log('================================================================\n');

  const testSubtitles = [
    {
      id: 1,
      start: '00:00:00,000',
      end: '00:00:05,260',
      startSec: 0,
      endSec: 5.26,
      originalText: '你看看别人的男朋友都是小乃哥 / 你再看看你 / 就站一个字 走'
    },
    {
      id: 2,
      start: '00:00:05,260',
      end: '00:00:10,040',
      startSec: 5.26,
      endSec: 10.04,
      originalText: '对对对 我就站了一个字 / 剩下的两个字你都站'
    },
    {
      id: 3,
      start: '00:00:10,680',
      end: '00:00:12,800',
      startSec: 10.68,
      endSec: 12.8,
      originalText: '你是不是活够了'
    }
  ];

  console.log('Invoking translateSubtitles with Natural Spoken Cinema Khmer rules...');
  const results = await geminiService.translateSubtitles(testSubtitles);

  console.log('\n--- Translation Results ---');
  results.forEach((r, idx) => {
    console.log(`[Line ${idx + 1}] Original: ${r.originalText}`);
    console.log(`         English:  ${r.englishText}`);
    console.log(`         Khmer:    ${r.khmerText}`);
  });

  // Verify Guardrail: NEVER output "ចាស់ៗ"
  const line2Khmer = results[1].khmerText;
  assert(!line2Khmer.includes('ចាស់ៗ'), 'Must NEVER output "ចាស់ៗ" for agreement!');
  console.log('\n  ✅ [PASS] No "ចាស់ៗ" hallucination detected!');

  // Verify Guardrail: Line 3 must NOT have broken particle "ហំ?"
  const line3Khmer = results[2].khmerText;
  assert(!line3Khmer.includes('ហំ?'), 'Must NOT have broken particle "ហំ?"');
  console.log('  ✅ [PASS] Line 3 has clean cinema confrontational phrasing.');

  console.log('\n================================================================');
  console.log('🎉 TEST PASSED: PERMANENT NATURAL SPOKEN CINEMA KHMER VERIFIED!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
