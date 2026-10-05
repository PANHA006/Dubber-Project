const fs = require('fs');
const path = require('path');
const app = require('../src/app');

async function testLiveTranscribeApi() {
  console.log('=====================================================');
  console.log('   🌐 LIVE HTTP /api/transcribe END-TO-END TEST');
  console.log('=====================================================\n');

  const samplePath = 'd:/Desktop/create-dubber-project/sample_video.mp4';
  if (!fs.existsSync(samplePath)) {
    console.error('❌ Sample video not found at:', samplePath);
    process.exit(1);
  }

  const PORT = 5099;
  const server = app.listen(PORT, async () => {
    console.log(`[TEST] Live Express server listening on http://localhost:${PORT}`);

    try {
      const fileBuffer = fs.readFileSync(samplePath);
      const boundary = '----WebKitFormBoundaryLiveTest' + Date.now();
      
      const payloadHeader = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="audio"; filename="sample_video.mp4"\r\n`,
        `Content-Type: video/mp4\r\n\r\n`
      ].join('');
      
      const payloadFooter = `\r\n--${boundary}--\r\n`;

      const body = Buffer.concat([
        Buffer.from(payloadHeader, 'utf-8'),
        fileBuffer,
        Buffer.from(payloadFooter, 'utf-8')
      ]);

      console.log(`[TEST] Sending POST /api/transcribe with real sample (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);
      const startTime = Date.now();

      const response = await fetch(`http://localhost:${PORT}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
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

      console.log(`\n✅ HTTP 200 SUCCESS! Received ${json.data.length} subtitle segments:\n`);
      json.data.forEach((seg) => {
        console.log(`   [#${seg.id}] [${seg.start} --> ${seg.end}]`);
        console.log(`       Original : "${seg.originalText}"`);
        console.log(`       Khmer    : "${seg.khmerText || '(ready for translation/editing)'}"`);
        console.log(`       Speaker  : "${seg.speaker}"`);
      });

      // Assertions
      if (json.data.length === 0) {
        throw new Error('Expected at least 1 subtitle segment');
      }

      const first = json.data[0];
      if (!first.start || !first.end || !first.originalText) {
        throw new Error('Missing required fields on subtitle segment');
      }

      console.log('\n=====================================================');
      console.log('🎉 LIVE API TRANSCRIPTION VERIFIED AND WORKING 100%!');
      console.log('=====================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ LIVE API TEST FAILED:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

testLiveTranscribeApi();
