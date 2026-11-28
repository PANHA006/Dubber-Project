/**
 * Test Suite: Parallel Stem Batching, 2-Stage Hierarchical Merge & Single-Flight Lock
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const videoRendererService = require('../src/services/video-renderer.service');

console.log('\n======================================================');
console.log('   🎛️ TESTING STEM MERGE & SINGLE-FLIGHT LOCK         ');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

async function it(desc, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  const src = fs.readFileSync(path.join(__dirname, '../src/services/video-renderer.service.js'), 'utf-8');

  await it('assembleMasterVoiceTrack preserves Promise.all parallel stem batching and uses unique runId', async () => {
    assert.ok(src.includes('Promise.all('), 'Must preserve Promise.all for parallel stem batches');
    assert.ok(src.includes('temp_stem_${runId}_${batchIdx}.wav'), 'Must use unique runId on temp stem filenames');
  });

  await it('mergeStemsHierarchical splits 25 stems into groups <= 10 instead of amix=inputs=25', async () => {
    const origMix = videoRendererService.mixAudioStems;
    const calls = [];
    videoRendererService.mixAudioStems = async (stems, out) => {
      calls.push({ count: stems.length, out });
      return out;
    };

    try {
      const fakeStems = Array.from({ length: 25 }, (_, i) => `fake_stem_${i}.wav`);
      const tempFiles = [];
      await videoRendererService.mergeStemsHierarchical(fakeStems, 'testrun1', 100, tempFiles, 'final_master.wav', 10);

      // 25 stems -> groups of 10, 10, 5 (3 calls) + final merge of 3 (1 call) = 4 calls, all <= 10
      assert.strictEqual(calls.length, 4, `Expected 4 mix calls, got ${calls.length}`);
      assert.ok(calls.every(c => c.count <= 10), 'Every mixAudioStems call must have <= 10 inputs');
      assert.strictEqual(calls[calls.length - 1].out, 'final_master.wav');
    } finally {
      videoRendererService.mixAudioStems = origMix;
    }
  });

  await it('buildTimelineMasterAudio coalesces concurrent duplicate calls via single-flight lock', async () => {
    const origInternal = videoRendererService._buildTimelineMasterAudioInternal;
    let execCount = 0;
    videoRendererService._buildTimelineMasterAudioInternal = async () => {
      execCount++;
      await new Promise(r => setTimeout(r, 40));
      return { masterAudioUrl: '/storage/voices/master_test.mp3' };
    };

    try {
      const [r1, r2] = await Promise.all([
        videoRendererService.buildTimelineMasterAudio({ subtitles: [] }),
        videoRendererService.buildTimelineMasterAudio({ subtitles: [] })
      ]);
      assert.strictEqual(execCount, 1, 'Concurrent calls must coalesce into 1 execution');
      assert.deepStrictEqual(r1, r2);
      assert.strictEqual(videoRendererService._activeMasterBuildPromise, null, 'Lock must clear after completion');
    } finally {
      videoRendererService._buildTimelineMasterAudioInternal = origInternal;
    }
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
