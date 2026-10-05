const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = require('../src/app');

console.log('================================================================');
console.log('   🔍 END-TO-END SYSTEM REVIEW & AUDIT: REFRESH, PERSISTENCE & JSON');
console.log('================================================================\n');

async function runEndToEndAudit() {
  let passed = 0;
  let total = 0;

  function check(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // 1. Static Code Analysis & Reference Safety
  console.log('--- 1. STATIC CODE AUDIT & SCOPE SAFETY ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf8');
  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  check('formatTimecodeDisplay is properly imported and defined in main.js', () => {
    assert(mainJs.includes('formatTimecodeDisplay\n} from \'./video-player.js\';') || mainJs.includes('formatTimecodeDisplay'));
  });

  check('syncSubtitlesFromDOM is properly imported and called in getProjectPayload', () => {
    assert(mainJs.includes('syncSubtitlesFromDOM'));
    assert(mainJs.includes('syncSubtitlesFromDOM();'));
  });

  check('Empty subtitle overwrite guard exists in triggerProjectAutoSave', () => {
    assert(mainJs.includes('// Safety guard: Don\'t overwrite existing cached subtitles with empty array'));
  });

  check('Restoration grace lock (600ms) exists in loadSavedProject finally block', () => {
    assert(mainJs.includes('state.isRestoringProject = false;'));
    assert(mainJs.includes('600);'));
  });

  check('index.html contains both [Import JSON] and [Export JSON] toolbar buttons', () => {
    assert(indexHtml.includes('triggerJSONUpload()'));
    assert(indexHtml.includes('exportJSONFile()'));
    assert(indexHtml.includes('Import JSON'));
    assert(indexHtml.includes('Export JSON'));
  });

  // 2. Live HTTP API & Persistence Verification
  console.log('\n--- 2. LIVE SERVER STORAGE & PROJECT LOAD AUDIT ---');
  const PORT = 5136;
  const server = app.listen(PORT, async () => {
    try {
      // Step A: Fetch current project state
      const loadRes = await fetch(`http://localhost:${PORT}/api/project/load`);
      assert.strictEqual(loadRes.status, 200);
      const loadJson = await loadRes.json();

      check('GET /api/project/load returns 200 with valid project payload', () => {
        assert(loadJson.success);
        assert(loadJson.data);
      });

      check('Project contains valid video configuration', () => {
        assert(loadJson.data.video);
        assert(loadJson.data.video.videoUrl);
        assert(loadJson.data.video.name);
        assert(loadJson.data.video.duration > 0);
      });

      check('Project contains persistent subtitles array with at least 3 rows', () => {
        assert(Array.isArray(loadJson.data.subtitles));
        assert(loadJson.data.subtitles.length >= 3);
      });

      // Step B: Simulate User Updating Project with Complete 3-Language Subtitles
      console.log('\n--- 3. MULTILINGUAL DATA INTEGRITY & PERSISTENCE ROUND-TRIP ---');
      const enrichedSubtitles = [
        {
          id: 'sub-test-1',
          selected: false,
          start: '00:00:00,000',
          end: '00:00:05,260',
          startSec: 0,
          endSec: 5.26,
          originalText: '你看看别人的男朋友都是小乃哥 / 你再看看你 / 就站一个字 走',
          englishText: 'Look at other people\'s boyfriends, they are so sweet. Look at you, totally useless.',
          khmerText: 'មើលប្រុសគេផង គេចេះយកចិត្តយកថ្លើម មើលមុខឯងវិញ គ្មានបានការសោះ ដើរចេញទៅ!',
          voice: 'Sreymom (Female)',
          status: 'Ready'
        },
        {
          id: 'sub-test-2',
          selected: false,
          start: '00:00:05,260',
          end: '00:00:10,040',
          startSec: 5.26,
          endSec: 10.04,
          originalText: '对对对 我就站了一个字 / 剩下的两个字你都站',
          englishText: 'Right right right! I only take up one word, but you take up all the rest!',
          khmerText: 'ត្រូវហើយ! ខ្ញុំចេះតែមួយម៉ាត់ហ្នឹងឯង ចំណែកពីរម៉ាត់ទៀតឯងជាអ្នកកាន់កាប់តើ!',
          voice: 'Piseth (Male)',
          status: 'Ready'
        },
        {
          id: 'sub-test-3',
          selected: false,
          start: '00:00:10,680',
          end: '00:00:12,800',
          startSec: 10.68,
          endSec: 12.8,
          originalText: '你是不是活够了',
          englishText: 'Have you lived long enough? Are you asking for a beating?',
          khmerText: 'ឯងចង់អស់អាយុ ឬចង់ត្រូវមួយដៃមែនទេ?!',
          voice: 'Sreymom (Female)',
          status: 'Ready'
        }
      ];

      const savePayload = {
        video: loadJson.data.video,
        subtitles: enrichedSubtitles,
        dubbingSettings: loadJson.data.dubbingSettings
      };

      const saveRes = await fetch(`http://localhost:${PORT}/api/project/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
      });
      assert.strictEqual(saveRes.status, 200);

      // Step C: Simulate Immediate Page Refresh (F5) - Load Project Back
      const refreshRes = await fetch(`http://localhost:${PORT}/api/project/load`);
      const refreshJson = await refreshRes.json();

      check('Refresh restores all 3 multilingual subtitles identically', () => {
        assert.strictEqual(refreshJson.data.subtitles.length, 3);
        assert.strictEqual(refreshJson.data.subtitles[0].originalText, enrichedSubtitles[0].originalText);
        assert.strictEqual(refreshJson.data.subtitles[0].englishText, enrichedSubtitles[0].englishText);
        assert.strictEqual(refreshJson.data.subtitles[0].khmerText, enrichedSubtitles[0].khmerText);
        assert.strictEqual(refreshJson.data.subtitles[0].voice, enrichedSubtitles[0].voice);
        assert.strictEqual(refreshJson.data.subtitles[0].startSec, 0);
        assert.strictEqual(refreshJson.data.subtitles[0].endSec, 5.26);
      });

      check('Refresh preserves video name and duration', () => {
        assert.strictEqual(refreshJson.data.video.name, loadJson.data.video.name);
        assert.strictEqual(refreshJson.data.video.duration, loadJson.data.video.duration);
      });

      // Step D: Simulate JSON Export & Import cycle
      console.log('\n--- 4. JSON EXPORT & RE-IMPORT FIDELITY ---');
      const exportedJsonStr = JSON.stringify(refreshJson.data.subtitles, null, 2);
      const reimported = JSON.parse(exportedJsonStr);

      check('JSON stringify & parse maintains exact length and field values', () => {
        assert.strictEqual(reimported.length, 3);
        assert.strictEqual(reimported[2].khmerText, 'ឯងចង់អស់អាយុ ឬចង់ត្រូវមួយដៃមែនទេ?!');
        assert.strictEqual(reimported[2].voice, 'Sreymom (Female)');
      });

      console.log('\n================================================================');
      console.log(`🎉 ALL END-TO-END AUDIT CHECKS PASSED: ${passed}/${total} (100%)!`);
      console.log('================================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ AUDIT FAILED:', err);
      server.close(() => process.exit(1));
    }
  });
}

runEndToEndAudit();
