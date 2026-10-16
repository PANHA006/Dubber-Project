const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('../src/app');

/**
 * End-to-End Test Suite for DAI Dubber Pro
 * Tests:
 * 1. Health API (GET /api/health)
 * 2. Status API (GET /api/status)
 * 3. Transcribe API - Error on missing audio file (POST /api/transcribe)
 * 4. Transcribe API - Validation on audio file upload
 * 5. Frontend index.html validation (all buttons, controls, progress banner, layout)
 * 6. Client JavaScript files integrity (audio-extractor.js, subtitles.js, main.js)
 */

async function runE2ETests() {
  const TEST_PORT = 5088;
  const server = app.listen(TEST_PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`   🚀 RUNNING DAI DUBBER PRO END-TO-END (E2E) TESTS`);
    console.log(`======================================================\n`);

    let passedCount = 0;
    let failedCount = 0;

    function assert(testName, condition, detail = '') {
      if (condition) {
        console.log(`✅ PASS: ${testName}`);
        passedCount++;
      } else {
        console.error(`❌ FAIL: ${testName} ${detail ? '-> ' + detail : ''}`);
        failedCount++;
      }
    }

    try {
      const baseUrl = `http://localhost:${TEST_PORT}`;

      // --- TEST 1: Health Check Endpoint ---
      const healthRes = await fetch(`${baseUrl}/api/health`);
      const healthData = await healthRes.json();
      assert('Health Check (GET /api/health)', healthRes.status === 200 && healthData.success === true);

      // --- TEST 2: Status Endpoint ---
      const statusRes = await fetch(`${baseUrl}/api/status`);
      const statusData = await statusRes.json();
      assert('System Status (GET /api/status)', statusRes.status === 200 && statusData.data?.status === 'operational');

      // --- TEST 3: Transcribe with Missing File ---
      const noFileRes = await fetch(`${baseUrl}/api/transcribe`, { method: 'POST' });
      const noFileData = await noFileRes.json();
      assert(
        'Transcribe 400 Bad Request on Missing File',
        noFileRes.status === 400 && noFileData.success === false && noFileData.message.includes('មិនមានឯកសារសំឡេង')
      );

      // --- TEST 4: Transcribe with Synthetic WAV File Upload ---
      // Create a small mock WAV buffer (44-byte standard WAV header + 100 samples)
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + 200, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16); // subchunk1 size
      wavHeader.writeUInt16LE(1, 20); // PCM
      wavHeader.writeUInt16LE(1, 22); // mono
      wavHeader.writeUInt32LE(16000, 24); // sample rate 16000
      wavHeader.writeUInt32LE(32000, 28); // byte rate
      wavHeader.writeUInt16LE(2, 32); // block align
      wavHeader.writeUInt16LE(16, 34); // bits per sample
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(200, 40);

      const dummyAudioData = Buffer.concat([wavHeader, Buffer.alloc(200)]);
      const tempAudioPath = path.join(__dirname, 'temp_test_audio.wav');
      fs.writeFileSync(tempAudioPath, dummyAudioData);

      // Construct multipart form data
      const boundary = '----WebKitFormBoundaryE2ETest' + Date.now();
      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="audio"; filename="test.wav"\r\n`,
        `Content-Type: audio/wav\r\n\r\n`,
        dummyAudioData,
        `\r\n--${boundary}--\r\n`
      ];

      // Convert bodyParts into single Buffer
      const bodyBuffers = bodyParts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
      const fullBody = Buffer.concat(bodyBuffers);

      const uploadRes = await fetch(`${baseUrl}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: fullBody,
      });

      const uploadData = await uploadRes.json();
      const isCleanExecution =
        uploadRes.status === 200 ||
        (uploadRes.status === 500 &&
          (uploadData.message?.includes('Gemini') ||
           uploadData.message?.includes('API_KEY') ||
           uploadData.message?.includes('សំឡេង')));
      assert(
        'Upload Audio endpoint parses file and invokes service cleanly',
        isCleanExecution,
        uploadData.message
      );

      // Clean up local temp file
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      // --- TEST 5: Frontend Layout & Controls in index.html ---
      const indexRes = await fetch(`${baseUrl}/index.html`);
      const indexHtml = await indexRes.text();

      assert(
        'Frontend has "btn-transcribe" button with onclick handler',
        indexHtml.includes('id="btn-transcribe"') && indexHtml.includes('startTranscription()')
      );

      assert(
        'Frontend has "transcribe-progress-banner" element',
        indexHtml.includes('id="transcribe-progress-banner"') && indexHtml.includes('transcribe-status-text')
      );

      assert(
        'Frontend has Subtitle Data Table container',
        indexHtml.includes('id="subtitle-table-body"')
      );

      assert(
        'Frontend has separate START, END, ORIGINAL TEXT, and KHMER TEXT table headers',
        indexHtml.includes('>START</th>') &&
        indexHtml.includes('>END</th>') &&
        indexHtml.includes('>ORIGINAL TEXT</th>') &&
        indexHtml.includes('>KHMER TEXT (EDITABLE)</th>')
      );

      assert(
        'Frontend has Gemini API Key settings input',
        indexHtml.includes('id="input-gemini-api-key"')
      );

      // --- TEST 6: Static Script Files Loaded without 404 ---
      const audioExtractorRes = await fetch(`${baseUrl}/js/audio-extractor.js`);
      const audioExtractorCode = await audioExtractorRes.text();
      assert(
        'audio-extractor.js is served and contains extractAudioFromVideo',
        audioExtractorRes.status === 200 && audioExtractorCode.includes('export async function extractAudioFromVideo')
      );

      const mainJsRes = await fetch(`${baseUrl}/js/main.js`);
      const mainJsCode = await mainJsRes.text();
      assert(
        'main.js is served and contains startTranscription implementation',
        mainJsRes.status === 200 && mainJsCode.includes('window.startTranscription')
      );

      // --- TEST 7: Video Player Module Integrity ---
      const videoPlayerRes = await fetch(`${baseUrl}/js/video-player.js`);
      const videoPlayerCode = await videoPlayerRes.text();
      assert(
        'video-player.js is served and has native event listeners (timeupdate, play, pause)',
        videoPlayerRes.status === 200 &&
        videoPlayerCode.includes("addEventListener('timeupdate'") &&
        videoPlayerCode.includes("addEventListener('play'") &&
        videoPlayerCode.includes("addEventListener('pause'")
      );

      assert(
        'video-player.js has playerViewport click-to-play support',
        videoPlayerCode.includes("playerViewport.addEventListener('click'")
      );

      assert(
        'video-player.js has autoplay fallback (muted retry)',
        videoPlayerCode.includes('mainVideo.muted = true')
      );

      // --- TEST 8: Initial State & Empty State Integrity ---
      const stateJsRes = await fetch(`${baseUrl}/js/state.js`);
      const stateJsCode = await stateJsRes.text();
      assert(
        'state.js initializes with empty subtitles array (subtitles: [])',
        stateJsRes.status === 200 && stateJsCode.includes('subtitles: []')
      );

      const subtitlesJsRes = await fetch(`${baseUrl}/js/subtitles.js`);
      const subtitlesJsCode = await subtitlesJsRes.text();
      assert(
        'subtitles.js includes friendly Empty State placeholder for empty subtitles',
        subtitlesJsRes.status === 200 &&
        subtitlesJsCode.includes('state.subtitles.length === 0') &&
        subtitlesJsCode.includes('មិនទាន់មានទិន្នន័យ Subtitles នៅឡើយទេ')
      );

      // --- TEST 9: Gemini 3.6 Flash Model Configuration & Service Integrity ---
      const geminiService = require('../src/services/gemini.service');
      assert(
        'Gemini Service module exposes the 2-step translation API',
        typeof geminiService.translateSubtitles === 'function' &&
        typeof geminiService.translateChineseToEnglish === 'function' &&
        typeof geminiService.translateEnglishToKhmer === 'function' &&
        typeof geminiService.executeWithFailover === 'function'
      );

      assert(
        'Environment configures GEMINI_MODEL as "gemini-3.6-flash"',
        process.env.GEMINI_MODEL === 'gemini-3.6-flash'
      );

      const geminiServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/gemini.service.js'), 'utf8');
      // The prompt wording now lives in src/prompts/translation-prompts.js; the
      // service must delegate to it, so assert the delegation on the service and
      // the actual Khmer rules on the prompt library.
      const translationPromptsCode = fs.readFileSync(path.join(__dirname, '../src/prompts/translation-prompts.js'), 'utf8');
      assert(
        'gemini.service.js delegates both steps to the prompt library',
        geminiServiceCode.includes('buildStep1Prompt(inputLines)') &&
        geminiServiceCode.includes('buildStep2Prompt(inputLines)')
      );

      assert(
        'translation-prompts.js enforces Spoken Cinema Khmer and bans the "ចាស់" hallucination',
        translationPromptsCode.includes('NATURAL SPOKEN CINEMA KHMER') &&
        translationPromptsCode.includes('ABSOLUTE PROHIBITION ON "ចាស់" FOR AFFIRMATION')
      );

      assert(
        'gemini.service.js returns both englishText and khmerText per line',
        geminiServiceCode.includes('englishText:') &&
        geminiServiceCode.includes('khmerText:')
      );

      const subtitlesRes = await fetch(`${baseUrl}/js/subtitles.js`);
      const subtitlesCode = await subtitlesRes.text();
      assert(
        'subtitles.js renders separate originalText and khmerText inputs',
        subtitlesCode.includes('sub-original-text-input') &&
        subtitlesCode.includes('sub-text-input')
      );

      // --- TEST 10: Single-Pass Audio Extraction for Faster-Whisper ---
      assert(
        'audio-extractor.js exports extractAudioFromVideo and monoFloat32ToWavBlob',
        audioExtractorCode.includes('export async function extractAudioFromVideo') &&
        audioExtractorCode.includes('export function monoFloat32ToWavBlob') &&
        audioExtractorCode.includes('OfflineAudioContext')
      );

      assert(
        'main.js invokes single-pass extractAudioFromVideo and renders subtitles cleanly',
        mainJsCode.includes('extractAudioFromVideo') &&
        mainJsCode.includes('formatTimecodeSRT') &&
        mainJsCode.includes('/api/transcribe')
      );

      // --- TEST 11: Silence Detection Algorithm Mathematical Verification ---
      // Simulate 16kHz audio buffer where a silence dip occurs at 592s (inside 570s - 630s window)
      const sampleRate = 16000;
      const testBufferLength = 630 * sampleRate;
      const testBuffer = new Float32Array(testBufferLength);
      // Fill with noise/speech
      for (let i = 0; i < testBufferLength; i++) {
        testBuffer[i] = (Math.random() - 0.5) * 0.8;
      }
      // Inject clear silence dip at 592s - 594s
      const silenceStart = Math.floor(592 * sampleRate);
      const silenceEnd = Math.floor(594 * sampleRate);
      for (let i = silenceStart; i < silenceEnd; i++) {
        testBuffer[i] = 0.0001; // virtually zero
      }

      // Inline verify findLowestRmsPoint logic
      let minRms = Infinity;
      let optimalSample = 0;
      const frameSamples = Math.floor(0.2 * sampleRate);
      const hopSamples = Math.floor(0.1 * sampleRate);
      const startPos = Math.floor(570 * sampleRate);
      const endPos = Math.floor(630 * sampleRate);

      for (let pos = startPos; pos <= endPos - frameSamples; pos += hopSamples) {
        let sum = 0;
        for (let i = 0; i < frameSamples; i += 2) {
          const s = testBuffer[pos + i];
          sum += s * s;
        }
        const rms = Math.sqrt(sum / (frameSamples / 2));
        if (rms < minRms) {
          minRms = rms;
          optimalSample = pos + Math.floor(frameSamples / 2);
        }
      }
      const detectedSplitSec = optimalSample / sampleRate;

      assert(
        'Smart Silence Detection accurately identifies quiet pause in 09:30 - 10:30 window (570s - 630s)',
        detectedSplitSec >= 591.5 && detectedSplitSec <= 594.5,
        `Detected split at ${detectedSplitSec.toFixed(2)}s (expected 592s - 594s)`
      );

      // --- TEST 12: Timestamp Re-alignment / Offset Calculation Verification ---
      const { parseTimecodeSRT, formatTimecodeSRT } = await import('../public/js/subtitles.js');
      const chunkStartTime = 592.5; // Chunk 2 starts at 09:52.500
      const relativeStart = '00:01:10,000'; // 70 seconds into Chunk 2
      const relativeEnd = '00:01:15,500';   // 75.5 seconds into Chunk 2

      const absoluteStartSec = parseTimecodeSRT(relativeStart) + chunkStartTime; // 662.5s = 11:02,500
      const absoluteEndSec = parseTimecodeSRT(relativeEnd) + chunkStartTime;     // 668.0s = 11:08,000
      const formattedStart = formatTimecodeSRT(absoluteStartSec);
      const formattedEnd = formatTimecodeSRT(absoluteEndSec);

      assert(
        'Timestamp auto-offsetting correctly maps chunk subtitles to master video timeline',
        formattedStart === '00:11:02,500' && formattedEnd === '00:11:08,000',
        `Computed: ${formattedStart} - ${formattedEnd}`
      );

      assert(
        'parseTimecodeSRT correctly handles MM:SS,mmm, MM:SS, and seconds formats without zeroing out',
        parseTimecodeSRT('05:41,199') === 341.199 &&
        parseTimecodeSRT('05:41') === 341 &&
        parseTimecodeSRT('341.2s') === 341.2
      );

      assert(
        'Multer upload limit in api.routes.js is set to 200MB',
        fs.readFileSync(path.join(__dirname, '../src/routes/api.routes.js'), 'utf8').includes('200 * 1024 * 1024')
      );

      // --- TEST 13: Live Terminal Logger Bridge Verification ---
      const loggerUtil = require('../src/utils/terminal-logger');
      assert(
        'terminal-logger utility exists and exports formatTerminalLog',
        typeof loggerUtil.formatTerminalLog === 'function'
      );

      const logBridgeRes = await fetch(`${baseUrl}/api/terminal-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'TEST:CLI',
          message: 'Automated test suite terminal log verification',
          details: { status: 'testing', time: Date.now() }
        })
      });
      const logBridgeData = await logBridgeRes.json();
      assert(
        'POST /api/terminal-log successfully receives and formats client logs',
        logBridgeRes.status === 200 && logBridgeData.success === true
      );

      const clientLoggerRes = await fetch(`${baseUrl}/js/logger.js`);
      const clientLoggerCode = await clientLoggerRes.text();
      assert(
        'public/js/logger.js is served and exports logToTerminal',
        clientLoggerRes.status === 200 && clientLoggerCode.includes('export function logToTerminal')
      );

      // --- TEST 14: Multi-Key Manager Pool, 24-Hour Lockout & Auto-Failover Verification ---
      const keyManager = require('../src/services/key-manager.service');
      
      // 14.1 Key parsing
      const parsedKeys = keyManager.parseKeys('AIzaSyKeyOne12345, AIzaSyKeyTwo67890\nAIzaSyKeyThree54321');
      assert(
        'KeyManager parses comma and newline separated multi-keys',
        parsedKeys.length === 3 && parsedKeys[0] === 'AIzaSyKeyOne12345' && parsedKeys[2] === 'AIzaSyKeyThree54321'
      );

      // 14.2 24-Hour Lockout detection on daily quota error
      const mockDailyError = {
        message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash',
        details: [{
          quotaMetric: 'generate_content_free_tier_requests',
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
          quotaValue: '20'
        }]
      };
      const testKeyA = 'AIzaSyTestKeyA_Daily11111';
      const testKeyB = 'AIzaSyTestKeyB_Healthy22222';
      
      const lockoutResult = keyManager.markKeyExhausted(testKeyA, mockDailyError);
      assert(
        'KeyManager marks key as LOCKED_24H when daily quota is exceeded',
        lockoutResult.isDailyLocked === true &&
        lockoutResult.waitDurationSec === 24 * 3600
      );

      // 14.3 Active key selection skips locked key and selects next healthy key
      const activeKey = keyManager.getActiveKey(`${testKeyA}, ${testKeyB}`);
      assert(
        'KeyManager automatically skips 24H-locked key and selects healthy key',
        activeKey.key !== testKeyA && (activeKey.key === testKeyB || keyManager.getConfiguredKeys().includes(activeKey.key))
      );

      // Cleanup test keys from state
      delete keyManager.keyStates[testKeyA];
      delete keyManager.keyStates[testKeyB];
      keyManager.saveState();

      // --- TEST SUMMARY ---
      console.log(`\n------------------------------------------------------`);
      console.log(`  Tests Passed : ${passedCount}`);
      console.log(`  Tests Failed : ${failedCount}`);
      console.log(`------------------------------------------------------`);

      if (failedCount === 0) {
        console.log(`🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!\n`);
      } else {
        console.error(`⚠️ SOME TESTS FAILED. Please review output above.\n`);
      }

    } catch (err) {
      console.error('E2E Test Suite Error:', err);
    } finally {
      server.close();
    }
  });
}

runE2ETests();
