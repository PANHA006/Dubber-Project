/**
 * Test Suite: Unified 44.1kHz Audio Resampling & Audio Clock Sync
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================');
console.log('   🎵 TESTING UNIFIED 44.1kHz AUDIO RESAMPLING PIPELINE');
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
  const serviceFile = path.join(__dirname, '../src/services/video-renderer.service.js');
  const serviceCode = fs.readFileSync(serviceFile, 'utf-8');

  it('assembleMasterVoiceTrack resamples all voice clips to 44.1kHz before adelay', () => {
    assert.ok(serviceCode.includes('aresample=44100:async=1'), 'Must include aresample=44100:async=1');
    assert.ok(serviceCode.includes('sample_rates=44100:channel_layouts=stereo'), 'Must format sample rate to 44100 stereo');
  });

  it('renderBatch and mergeArgs output 44.1kHz stereo PCM WAV', () => {
    assert.ok(serviceCode.includes("'-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2'"), 'Must enforce 44.1kHz stereo in stems');
  });

  it('renderDubbedVideo synchronizes BGM and Master Voice with aresample=44100:async=1', () => {
    assert.ok(serviceCode.includes('[bgm_vol][master_sync]amix='), 'Must mix resampled bgm and master sync');
    assert.ok(serviceCode.includes("'-c:a', 'aac', '-b:a', '192k', '-ar', '44100'"), 'Final AAC stream must be locked to 44.1kHz');
  });

  it('main.js handles stale dubbedVideoUrl gracefully with helpful Khmer toast', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
    assert.ok(mainJs.includes('videoEl.onerror'), 'Must handle videoEl.onerror on modal');
    assert.ok(mainJs.includes('សូមចុចប៊ូតុង "🎬 Generate Video"'), 'Must prompt user to Generate Video first');
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
