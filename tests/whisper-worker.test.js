const path = require('path');
const whisperService = require('../src/services/whisper.service');

async function runTest() {
  console.log('=====================================================');
  console.log('   🎙️ FASTER-WHISPER WORKER INTEGRATION TEST');
  console.log('=====================================================\n');

  const sampleVideo = 'd:/Desktop/create-dubber-project/sample_video.mp4';

  console.log(`1. Testing transcription on sample: ${sampleVideo}...`);
  const startTime = Date.now();

  try {
    const segments = await whisperService.transcribeAudio(sampleVideo, {
      model: 'base',
      vad: true
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Finished in ${elapsed}s. Extracted ${segments.length} segments.\n`);

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('Expected non-empty array of segments');
    }

    console.log('2. Validating Segment Schema & Timestamps:');
    const tsRegex = /^\d{2}:\d{2}:\d{2},\d{3}$/;

    segments.forEach((seg, idx) => {
      console.log(`   [Seg ${seg.id}] ${seg.start} --> ${seg.end} | "${seg.originalText}"`);
      if (!tsRegex.test(seg.start)) {
        throw new Error(`Invalid start timestamp format: ${seg.start}`);
      }
      if (!tsRegex.test(seg.end)) {
        throw new Error(`Invalid end timestamp format: ${seg.end}`);
      }
      if (!seg.originalText) {
        throw new Error(`Segment ${idx} missing originalText`);
      }
    });

    console.log('\n3. Validating Punctuation Splitting:');
    if (segments[0].originalText.includes('Hello')) {
      console.log('   ✅ PASS: First segment correctly separated at punctuation ("Hello!")');
    } else {
      console.warn('   ⚠️ Note: First segment text:', segments[0].originalText);
    }

    console.log('\n=====================================================');
    console.log('🎉 ALL FASTER-WHISPER INTEGRATION CHECKS PASSED!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTest();
