/**
 * Test Suite: Clear All Data (Project-Only Storage Cleanup & Path Guard)
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../src/config');
const historyServiceModule = require('../src/services/history.service');

console.log('\n======================================================');
console.log('   🧹 TESTING PROJECT-ONLY CLEAR ALL DATA             ');
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

const origStorageDir = config.storageDir;
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dubber-clear-test-'));
const fakeStorage = path.join(sandboxRoot, 'Dubber-Project', 'storage');
const outsideFile = path.join(sandboxRoot, 'outside-do-not-delete.mp4');

try {
  config.storageDir = fakeStorage;
  const svc = new historyServiceModule.HistoryService();
  const rvcDir = path.join(fakeStorage, 'rvc_models');
  fs.mkdirSync(rvcDir, { recursive: true });

  // Populate project storage files + nested temp subfolder + .gitkeep + rvc_models + outside file
  const orphanVideo = path.join(svc.videosDir, 'orphan_video.mp4');
  const exportVideo = path.join(svc.exportsDir, 'exported_video.mp4');
  const voiceFile = path.join(svc.voicesDir, 'voice_1.mp3');
  const tempSubDir = path.join(svc.tempDir, 'test_tts');
  const tempNestedFile = path.join(tempSubDir, 'nested.mp3');
  const projectFile = path.join(svc.projectsDir, 'autosave_project.json');
  const gitkeepFile = path.join(svc.videosDir, '.gitkeep');
  const rvcFile = path.join(rvcDir, 'models.json');

  fs.mkdirSync(tempSubDir, { recursive: true });
  fs.writeFileSync(orphanVideo, 'video-bytes');
  fs.writeFileSync(exportVideo, 'export-bytes');
  fs.writeFileSync(voiceFile, 'voice-bytes');
  fs.writeFileSync(tempNestedFile, 'nested-bytes');
  fs.writeFileSync(projectFile, '{}');
  fs.writeFileSync(gitkeepFile, '');
  fs.writeFileSync(rvcFile, '{}');
  fs.writeFileSync(outsideFile, 'must-remain-safe');

  // Record one outside path in video_history.json to verify containment guard
  fs.writeFileSync(svc.historyFilePath, JSON.stringify([
    { id: 'ext-1', fileName: 'outside.mp4', filePath: outsideFile }
  ], null, 2));

  const result = svc.clearAllHistory();

  it('clears orphaned videos, exports, voices, nested temp subfolders, and projects', () => {
    assert.strictEqual(fs.existsSync(orphanVideo), false, 'videos/ orphan must be deleted');
    assert.strictEqual(fs.existsSync(exportVideo), false, 'exports/ file must be deleted');
    assert.strictEqual(fs.existsSync(voiceFile), false, 'voices/ file must be deleted');
    assert.strictEqual(fs.existsSync(tempSubDir), false, 'temp/ subfolder must be deleted');
    assert.strictEqual(fs.existsSync(projectFile), false, 'projects/ file must be deleted');
    assert.ok(result.deletedFilesCount >= 5, `Expected >= 5 deleted files, got ${result.deletedFilesCount}`);
  });

  it('resets video_history.json to empty array', () => {
    const after = JSON.parse(fs.readFileSync(svc.historyFilePath, 'utf-8'));
    assert.deepStrictEqual(after, []);
  });

  it('preserves .gitkeep and rvc_models/', () => {
    assert.strictEqual(fs.existsSync(gitkeepFile), true, '.gitkeep must be preserved');
    assert.strictEqual(fs.existsSync(rvcFile), true, 'rvc_models/ must be preserved');
  });

  it('NEVER deletes files outside project storageDir even if listed in video_history.json', () => {
    assert.strictEqual(fs.existsSync(outsideFile), true, 'Outside file must NOT be deleted');
  });
} finally {
  config.storageDir = origStorageDir;
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
}

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
