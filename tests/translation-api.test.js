const app = require('../src/app');

async function testTranslationApi() {
  console.log('=====================================================');
  console.log('   🤖 GEMINI AI TRANSLATION API TEST (/api/translate)');
  console.log('=====================================================\n');

  const PORT = 5110;
  const server = app.listen(PORT, async () => {
    try {
      const sampleSubtitles = [
        { id: 1, originalText: "Hello! Welcome to our video tutorial." },
        { id: 2, originalText: "Today we will learn how to use artificial intelligence for audio dubbing." }
      ];

      console.log(`[TEST] Sending POST http://localhost:${PORT}/api/translate with 2 subtitles...`);
      const startTime = Date.now();

      const response = await fetch(`http://localhost:${PORT}/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subtitles: sampleSubtitles
        })
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[TEST] Response status: ${response.status} (${elapsed}s)`);

      const json = await response.json();

      if (response.status !== 200) {
        throw new Error(`API returned HTTP ${response.status}: ${JSON.stringify(json)}`);
      }

      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(`Invalid response structure: ${JSON.stringify(json)}`);
      }

      console.log('\n✅ Translation Response:');
      json.data.forEach(item => {
        console.log(`   [#${item.id}]`);
        console.log(`       Original: "${item.originalText}"`);
        console.log(`       Khmer   : "${item.khmerText}"`);
      });

      const hasKhmer = json.data.every(item => item.khmerText && item.khmerText.length > 0);
      if (!hasKhmer) {
        throw new Error('Expected translated khmerText for each subtitle');
      }

      console.log('\n=====================================================');
      console.log('🎉 GEMINI TRANSLATION API VERIFIED & WORKING 100%!');
      console.log('=====================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ TRANSLATION TEST FAILED:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

testTranslationApi();
