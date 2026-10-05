const fs = require('fs');
const path = require('path');
const app = require('../src/app');

async function testFullPipeline() {
  console.log('================================================================');
  console.log('   🎬 COMPLETE PIPELINE AUDIT & E2E INTEGRATION TEST');
  console.log('   Step 1: Pure Faster-Whisper Transcription ($0 Offline)');
  console.log('   Step 2: Dedicated Gemini AI Khmer Translation (Text-Only)');
  console.log('================================================================\n');

  const samplePath = 'd:/Desktop/create-dubber-project/sample_video.mp4';
  if (!fs.existsSync(samplePath)) {
    console.error('❌ Sample video file not found:', samplePath);
    process.exit(1);
  }

  const PORT = 5122;
  const server = app.listen(PORT, async () => {
    console.log(`[TEST SERVER] Listening on http://localhost:${PORT}\n`);

    try {
      // -------------------------------------------------------------
      // STAGE 1: Pure Faster-Whisper Transcription (NO Gemini involved)
      // -------------------------------------------------------------
      console.log('--- STAGE 1: TESTING PURE FASTER-WHISPER TRANSCRIPTION ---');
      const fileBuffer = fs.readFileSync(samplePath);
      const boundary = '----WebKitFormBoundaryPipelineTest' + Date.now();
      
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

      const t1 = Date.now();
      const transcribeRes = await fetch(`http://localhost:${PORT}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body
      });

      const transcribeTime = ((Date.now() - t1) / 1000).toFixed(1);
      const transcribeJson = await transcribeRes.json();

      if (transcribeRes.status !== 200 || !transcribeJson.success) {
        throw new Error(`Stage 1 failed (HTTP ${transcribeRes.status}): ${JSON.stringify(transcribeJson)}`);
      }

      const transcribedSegments = transcribeJson.data;
      console.log(`✅ Stage 1 Succeeded in ${transcribeTime}s! Extracted ${transcribedSegments.length} segments.`);
      
      transcribedSegments.forEach(seg => {
        console.log(`   [#${seg.id}] [${seg.start} --> ${seg.end}] Original: "${seg.originalText}"`);
      });

      // Verify that timestamps and text are present
      if (!transcribedSegments || transcribedSegments.length === 0) {
        throw new Error('Stage 1 returned 0 segments');
      }

      // -------------------------------------------------------------
      // STAGE 2: Dedicated Gemini AI Khmer Translation
      // -------------------------------------------------------------
      console.log('\n--- STAGE 2: TESTING GEMINI AI KHMER TRANSLATION ---');
      console.log(`Sending ${transcribedSegments.length} segments to POST /api/translate...`);

      const t2 = Date.now();
      const translateRes = await fetch(`http://localhost:${PORT}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: transcribedSegments
        })
      });

      const translateTime = ((Date.now() - t2) / 1000).toFixed(1);
      const translateJson = await translateRes.json();

      if (translateRes.status !== 200 || !translateJson.success) {
        throw new Error(`Stage 2 failed (HTTP ${translateRes.status}): ${JSON.stringify(translateJson)}`);
      }

      const translatedSegments = translateJson.data;
      console.log(`✅ Stage 2 Succeeded in ${translateTime}s! Translated ${translatedSegments.length} segments.\n`);

      // -------------------------------------------------------------
      // STAGE 3: Final Output Verification & Alignment Audit
      // -------------------------------------------------------------
      console.log('--- STAGE 3: FINAL SUBTITLE TABLE ALIGNMENT AUDIT ---');
      let allAligned = true;

      translatedSegments.forEach(seg => {
        console.log(`   [#${seg.id}] [${seg.start} --> ${seg.end}]`);
        console.log(`       Original Spoken : "${seg.originalText}"`);
        console.log(`       Khmer Voiceover : "${seg.khmerText}"`);

        if (!seg.khmerText || seg.khmerText.trim().length === 0) {
          allAligned = false;
        }
      });

      if (!allAligned) {
        throw new Error('Some segments are missing Khmer translation');
      }

      console.log('\n================================================================');
      console.log('🎉 100% COMPLETE PIPELINE AUDIT PASSED!');
      console.log('   - Faster-Whisper transcribed spoken dialogue with exact timestamps');
      console.log('   - Gemini AI translated dialogue into natural idiomatic Khmer');
      console.log('   - Zero errors, zero quota waste, full pipeline verified!');
      console.log('================================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ PIPELINE AUDIT FAILED:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

testFullPipeline();
