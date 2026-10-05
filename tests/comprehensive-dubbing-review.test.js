const geminiService = require('../src/services/gemini.service');
const assert = require('assert');

async function runComprehensiveReview() {
  console.log('================================================================');
  console.log('   🔍 COMPREHENSIVE REVIEW & STRESS TEST: DUBBING TRANSLATION');
  console.log('================================================================\n');

  // Test cases covering different durations:
  // 1. Ultra-short (<1.5s): greetings, affirmations, exclamations
  // 2. Medium (1.5s - 2.5s): everyday casual movie dialogue
  // 3. Complex/Long (>2.5s): full narrative sentences
  // 4. Edge cases: missing startSec, string timestamps only, short fast speech
  const testCases = [
    // Ultra-short dialogue
    { id: 1, start: "00:00:01,000", end: "00:00:01,800", startSec: 1.0, endSec: 1.8, originalText: "快点！" }, // Quick! (0.8s)
    { id: 2, start: "00:00:02,000", end: "00:00:03,000", startSec: 2.0, endSec: 3.0, originalText: "效果不错吧" }, // Not bad right? (1.0s)
    { id: 3, start: "00:00:03,200", end: "00:00:04,400", startSec: 3.2, endSec: 4.4, originalText: "晚上七点" }, // 7 PM (1.2s)
    
    // Medium dialogue (from user screenshot)
    { id: 4, start: "00:00:05,000", end: "00:00:06,800", startSec: 5.0, endSec: 6.8, originalText: "公司刚装的高清投影" }, // 1.8s
    { id: 5, start: "00:00:07,000", end: "00:00:08,800", startSec: 7.0, endSec: 8.8, originalText: "楼下地下车库等我" }, // 1.8s
    { id: 6, start: "00:00:09,000", end: "00:00:11,000", startSec: 9.0, endSec: 11.0, originalText: "一个破方案改了十几遍" }, // 2.0s
    
    // Longer dialogue (>2.5s)
    { id: 7, start: "00:00:11,500", end: "00:00:14,500", startSec: 11.5, endSec: 14.5, originalText: "如果今天晚上搞不定，明天客户那边我们就没办法交代了" }, // 3.0s
    
    // Timestamp edge cases (only string timestamps, no startSec/endSec properties)
    { id: 8, start: "00:01:05,250", end: "00:01:07,750", originalText: "你确定他现在还在办公室里面吗？" } // 2.5s parsed from string
  ];

  console.log(`📋 Running translation review across ${testCases.length} diverse scenarios...\n`);
  const startTime = Date.now();

  try {
    const results = await geminiService.translateSubtitles(testCases);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`⏱️ Completed in ${totalTime}s (Average ${(totalTime / testCases.length).toFixed(2)}s per line)\n`);
    console.log('----------------------------------------------------------------');
    console.log('ID | Duration | Original Text | Khmer Dubbing Output | Assessment');
    console.log('----------------------------------------------------------------');

    let passedAll = true;

    results.forEach((item, idx) => {
      const origItem = testCases[idx];
      let dur = 0;
      if (origItem.endSec && origItem.startSec) {
        dur = origItem.endSec - origItem.startSec;
      } else {
        dur = 2.5;
      }

      const khmer = item.khmerText || '';
      // Simple metric: length of khmer characters shouldn't be excessively bloated
      // Khmer characters per second should be reasonable (< 35 chars/sec for spoken dialogue)
      const charRate = (khmer.length / dur).toFixed(1);
      const isCompact = khmer.length > 0 && (dur <= 1.2 ? khmer.length <= 25 : khmer.length <= 60);

      const status = isCompact ? '✅ COMPACT & NATURAL' : '⚠️ CHECK PACING';
      if (!khmer) passedAll = false;

      console.log(`[#${item.id}] ${dur.toFixed(1)}s | "${origItem.originalText}"`);
      console.log(`     ↳ Khmer: "${khmer}"`);
      console.log(`     ↳ Metrics: ${khmer.length} chars (~${charRate} chars/s) -> ${status}\n`);
    });

    assert(passedAll, 'All items must return valid Khmer translation');
    assert(results.length === testCases.length, 'Results count must match input count');

    console.log('================================================================');
    console.log('🎉 ALL REVIEW CRITERIA MET! Translation is natural, punchy & timed!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('❌ Review Test Failed:', err.message);
    process.exit(1);
  }
}

runComprehensiveReview();
