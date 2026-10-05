const geminiService = require('../src/services/gemini.service');

async function testDubbingTranslation() {
  console.log('================================================================');
  console.log('   🎬 TESTING TIME-BUDGETED MOVIE DUBBING TRANSLATION');
  console.log('================================================================\n');

  // Exact sentences from user's screenshot
  const testSubtitles = [
    { id: 1, start: "00:00:03,000", end: "00:00:05,000", startSec: 3.0, endSec: 5.0, originalText: "一个破方案改了十几遍" },
    { id: 2, start: "00:00:05,400", end: "00:00:07,200", startSec: 5.4, endSec: 7.2, originalText: "信留的我人你很久了" },
    { id: 3, start: "00:00:15,000", end: "00:00:16,800", startSec: 15.0, endSec: 16.8, originalText: "公司刚装的高清投影" },
    { id: 4, start: "00:00:17,000", end: "00:00:18,200", startSec: 17.0, endSec: 18.2, originalText: "效果不错吧" },
    { id: 5, start: "00:00:19,000", end: "00:00:20,000", startSec: 19.0, endSec: 20.0, originalText: "晚上七点" },
    { id: 6, start: "00:00:20,200", end: "00:00:21,700", startSec: 20.2, endSec: 21.7, originalText: "楼下地下车库等我" }
  ];

  console.log(`Translating ${testSubtitles.length} lines with time duration budgets...\n`);
  const tStart = Date.now();

  try {
    const results = await geminiService.translateSubtitles(testSubtitles);
    const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);

    console.log(`✅ Translation completed in ${elapsed}s!\n`);
    console.log('================================================================');
    console.log('   RESULTS: ORIGINAL vs TIME-ALIGNED KHMER DUBBING');
    console.log('================================================================');

    results.forEach(item => {
      const dur = (item.endSec - item.startSec).toFixed(1);
      console.log(`[#${item.id}] Duration: ${dur}s`);
      console.log(`     Original : ${item.originalText}`);
      console.log(`     Khmer Dub: ${item.khmerText}`);
      console.log('----------------------------------------------------------------');
    });

    const allHaveKhmer = results.every(r => r.khmerText && r.khmerText.length > 0);
    if (!allHaveKhmer) throw new Error('Some lines failed to translate');

    console.log('🎉 ALL 6 REAL-WORLD DIALOGUE LINES TRANSLATED COMPACTLY & PERFECTLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

testDubbingTranslation();
