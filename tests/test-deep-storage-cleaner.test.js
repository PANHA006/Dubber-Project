/**
 * Test Suite: Deep Storage Cleaner & Cache Purging
 * Verifies that users can clear videos, voice audio files, temp files, and project cache.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================');
console.log('   🧹 TESTING DEEP STORAGE CLEANER & CACHE PURGE      ');
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
  const historyService = require('../src/services/history.service');

  it('historyService.getHistory() provides detailed storage breakdown (voices, temp, videos)', () => {
    const data = historyService.getHistory();
    assert.ok(data.storageStats, 'Must provide storageStats');
    assert.ok(data.storageStats.videos !== undefined, 'Must provide videos stats');
    assert.ok(data.storageStats.voices !== undefined, 'Must provide voices stats');
    assert.ok(data.storageStats.temp !== undefined, 'Must provide temp stats');
    assert.ok(typeof data.storageStats.grandTotalSizeMb === 'number', 'Must compute grandTotalSizeMb');
  });

  it('historyService.clearAllHistory() supports selective options (clearVoices, clearTemp)', () => {
    // Create a dummy temp file and voice file
    const dummyVoice = path.join(historyService.voicesDir, 'test_dummy_voice_for_clean.mp3');
    const dummyTemp = path.join(historyService.tempDir, 'test_dummy_temp_for_clean.wav');
    fs.writeFileSync(dummyVoice, 'voice dummy data', 'utf-8');
    fs.writeFileSync(dummyTemp, 'temp dummy data', 'utf-8');

    assert.ok(fs.existsSync(dummyVoice), 'Dummy voice exists before clean');
    assert.ok(fs.existsSync(dummyTemp), 'Dummy temp exists before clean');

    // Run selective clean
    const res = historyService.clearAllHistory({
      clearVideos: false,
      clearVoices: true,
      clearTemp: true,
      clearProjects: false
    });

    assert.ok(res.success, 'Clear must succeed');
    assert.strictEqual(fs.existsSync(dummyVoice), false, 'Dummy voice must be purged');
    assert.strictEqual(fs.existsSync(dummyTemp), false, 'Dummy temp must be purged');
  });

  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');

  it('index.html contains #clean-storage-modal with selective checkboxes', () => {
    assert.ok(html.includes('id="clean-storage-modal"'), 'Must have #clean-storage-modal');
    assert.ok(html.includes('id="clean-opt-videos"'), 'Must have videos checkbox');
    assert.ok(html.includes('id="clean-opt-voices"'), 'Must have voices checkbox');
    assert.ok(html.includes('id="clean-opt-temp"'), 'Must have temp checkbox');
    assert.ok(html.includes('id="clean-opt-project"'), 'Must have project checkbox');
    assert.ok(html.includes('id="btn-confirm-clean-storage"'), 'Must have confirm clean button');
  });

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

  it('main.js exposes storage cleaning controller functions', () => {
    assert.ok(mainJs.includes('window.openCleanStorageModal'), 'Must expose openCleanStorageModal');
    assert.ok(mainJs.includes('window.executeCleanStorage'), 'Must expose executeCleanStorage');
    assert.ok(mainJs.includes('window.toggleSelectAllCleanOptions'), 'Must expose toggleSelectAllCleanOptions');
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
