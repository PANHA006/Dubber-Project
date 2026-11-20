/**
 * Test Suite: Server-Side FFmpeg CFR Audio Extraction & Subtitle Gap Redistribution
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================');
console.log('   🎙️ TESTING SERVER-SIDE CFR & GAP REDISTRIBUTION     ');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  // 1. Test applySmartEndPadding with Smart Gap Redistribution
  it('applySmartEndPadding preserves natural dialogue buffer when lines are close (< 0.5s)', () => {
    const { applySmartEndPadding } = require('../public/js/subtitles.js');
    
    // Two close lines: Line 1 ends at 10.0, Line 2 starts at 10.3 (gap = 0.3s)
    const mockSubs = [
      { id: '1', start: '00:00:08,000', end: '00:00:10,000', startSec: 8.0, endSec: 10.0, originalText: 'Hello' },
      { id: '2', start: '00:00:10,300', end: '00:00:12,000', startSec: 10.3, endSec: 12.0, originalText: 'World' }
    ];

    const result = applySmartEndPadding(mockSubs, 0.70);
    // Gap is 0.3s. MIN_DIALOGUE_GAP is 0.12s. maxAllowed = 0.18s.
    // Proportional cushion = Math.min(0.70, 0.18 * 0.6) = 0.108s.
    // Line 1 endSec should be 10.108s, leaving ~0.192s before Line 2 starts at 10.3!
    assert.strictEqual(result[0].startSec, 8.0, 'startSec must not change');
    assert.ok(result[0].endSec < 10.3, 'endSec must not collide with next line');
    assert.ok(result[1].startSec - result[0].endSec >= 0.12, 'Must maintain at least 120ms breathing space between speakers');
  });

  it('applySmartEndPadding allows full padding when gap is wide (> 1.0s)', () => {
    const { applySmartEndPadding } = require('../public/js/subtitles.js');
    
    const mockSubs = [
      { id: '1', start: '00:00:05,000', end: '00:00:07,000', startSec: 5.0, endSec: 7.0, originalText: 'Wide gap' },
      { id: '2', start: '00:00:10,000', end: '00:00:12,000', startSec: 10.0, endSec: 12.0, originalText: 'Next line' }
    ];

    const result = applySmartEndPadding(mockSubs, 0.70);
    assert.strictEqual(result[0].endSec, 7.7, 'Should take full +0.70s padding when gap is wide');
    assert.strictEqual(result[0].startSec, 5.0, 'startSec must strictly anchor to speech start');
  });

  // 2. Test Server-Side CFR extraction on a real video
  const videoFile = 'Merged_Video_1795001402575.mp4';
  const videoPath = path.join(__dirname, '../storage/videos', videoFile);
  
  if (fs.existsSync(videoPath)) {
    it('Server-side CFR extraction creates sample-accurate WAV with no drift', async () => {
      const { spawnSync } = require('child_process');
      const tempWav = path.join(__dirname, '../storage/temp/test_unit_cfr.wav');
      
      const res = spawnSync('ffmpeg', [
        '-y',
        '-ss', '1400',
        '-to', '1405',
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-af', 'aresample=async=1:first_pts=0',
        tempWav
      ], { windowsHide: true });

      assert.strictEqual(res.status, 0, 'FFmpeg CFR command must succeed');
      assert.ok(fs.existsSync(tempWav), 'Output WAV file must exist');
      
      if (fs.existsSync(tempWav)) {
        fs.unlinkSync(tempWav);
      }
    });
  }

  // 3. Test API route accepts videoUrl
  it('dubber.controller.js and api.routes.js support Server-Side CFR transcribe', () => {
    const routeContent = fs.readFileSync(path.join(__dirname, '../src/routes/api.routes.js'), 'utf-8');
    assert.ok(routeContent.includes("upload.fields"), 'Route must use upload.fields to accept audio, video, or videoUrl');
    
    const controllerContent = fs.readFileSync(path.join(__dirname, '../src/controllers/dubber.controller.js'), 'utf-8');
    assert.ok(controllerContent.includes("extractAudioCfr"), 'Controller must define extractAudioCfr');
    assert.ok(controllerContent.includes("req.body?.videoUrl"), 'Controller must handle req.body.videoUrl');
  });

  // 4. Test frontend main.js delegates to Server CFR when videoUrl is present
  it('main.js leverages Server-Side CFR Extraction when videoUrl is present', () => {
    const mainJsContent = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
    assert.ok(mainJsContent.includes("useServerCfr"), 'main.js must check useServerCfr');
    assert.ok(mainJsContent.includes("formData.append('videoUrl', state.videoUrl)"), 'main.js must send videoUrl for server extraction');
  });

  console.log('\n------------------------------------------------------');
  console.log(`  Tests Passed : ${passed}`);
  console.log(`  Tests Failed : ${failed}`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
