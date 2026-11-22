/**
 * Test Suite: Last-Row 15s Timeout & Auto-Heal Retry for Voice Generation
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================');
console.log('   🎙️ TESTING LAST-ROW TIMEOUT & AUTO-HEAL RETRY       ');
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
  const workerFile = path.join(__dirname, '../src/workers/tts_worker.py');
  const workerCode = fs.readFileSync(workerFile, 'utf-8');

  it('tts_worker.py wraps last row with asyncio.wait_for timeout=15.0', () => {
    assert.ok(workerCode.includes('if is_last:'), 'Must check is_last flag');
    assert.ok(workerCode.includes('asyncio.wait_for(communicator.save(out_path), timeout=15.0)'), 'Must apply 15s timeout on last row');
    assert.ok(workerCode.includes('await communicator.save(out_path)'), 'Normal rows must retain fast direct save');
  });

  it('tts_worker.py identifies last row via index == total_items - 1 and active remaining requests', () => {
    assert.ok(workerCode.includes('is_last = (idx == total_items - 1) or (progress["active"] <= 1)'), 'Must pass is_last on final item index or last active request');
  });

  it('tts_worker.py returns clean failure results without blocking internal retry loops', () => {
    assert.ok(workerCode.includes('"status": "OK" if res.get("success") else "FAIL"'), 'Must track failed items');
    assert.ok(workerCode.includes('"failedCount": failed_count'), 'Must report failedCount in payload');
  });

  it('tts.service.js enforces inactivity watchdog timer to prevent process freeze', () => {
    const ttsServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/tts.service.js'), 'utf-8');
    assert.ok(ttsServiceCode.includes('activityTimer'), 'Must declare activity watchdog timer');
    assert.ok(ttsServiceCode.includes('proc.kill'), 'Must terminate stuck worker on watchdog trigger');
  });

  it('public/js/main.js displays checking banner and executes multi-round auto-retries', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
    assert.ok(mainJs.includes('MAX_AUTO_RETRIES = 15'), 'Must support up to 15 auto-retries');
    assert.ok(mainJs.includes('កំពុងត្រួតពិនិត្យជួរដែលមិនទាន់ជោគជ័យ'), 'Must show Khmer checking banner');
    assert.ok(mainJs.includes('Auto-Retry (ជុំទី'), 'Must show round progress on banner');
    assert.ok(mainJs.includes('window.generateSingleVoice'), 'Must expose generateSingleVoice for direct row retry');
  });

  it('public/js/subtitles.js renders direct 1-click retry button for rows missing audio', () => {
    const subJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
    assert.ok(subJs.includes('window.generateSingleVoice'), 'Must render generateSingleVoice button on rows');
    assert.ok(subJs.includes('Retry'), 'Must show Retry label on missing audio rows');
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
