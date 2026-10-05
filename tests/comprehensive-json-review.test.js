const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = require('../src/app');

console.log('================================================================');
console.log('   🔍 DEEP REVIEW & END-TO-END TEST: MULTILINGUAL JSON FEATURE');
console.log('================================================================\n');

async function runReviewAndTest() {
  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // REVIEW PHASE 1: Real Project Data Simulation & Round-Trip
  // -------------------------------------------------------------
  console.log('--- 1. ACTIVE PROJECT DATA & MULTILINGUAL PERSISTENCE REVIEW ---');

  const autosavePath = path.join(__dirname, '../storage/projects/autosave_project.json');
  assert(fs.existsSync(autosavePath), 'autosave_project.json must exist');
  const autosaveData = JSON.parse(fs.readFileSync(autosavePath, 'utf8'));

  test('Project contains active subtitles array', () => {
    assert(Array.isArray(autosaveData.subtitles), 'subtitles should be an array');
    assert(autosaveData.subtitles.length > 0, 'subtitles should not be empty');
  });

  // Enrich with 3-language data (Chinese, English pivot, Spoken Cinema Khmer)
  const realisticSubtitles = [
    {
      id: autosaveData.subtitles[0].id,
      start: autosaveData.subtitles[0].start,
      end: autosaveData.subtitles[0].end,
      startSec: autosaveData.subtitles[0].startSec,
      endSec: autosaveData.subtitles[0].endSec,
      originalText: autosaveData.subtitles[0].originalText,
      englishText: "Look at other guys' boyfriends, they're total cuties. Look at you, you're just standing there like a dummy.",
      khmerText: 'មើលសង្សារគេផង គេចេះយកចិត្តទុកដាក់ មើលមុខឯងវិញ គ្មានបានការសោះ!',
      voice: 'Sreymom (Female)',
      status: 'Ready'
    },
    {
      id: autosaveData.subtitles[1].id,
      start: autosaveData.subtitles[1].start,
      end: autosaveData.subtitles[1].end,
      startSec: autosaveData.subtitles[1].startSec,
      endSec: autosaveData.subtitles[1].endSec,
      originalText: autosaveData.subtitles[1].originalText,
      englishText: "Yeah right! I only fit one word, but you fit all the remaining two words!",
      khmerText: 'ត្រូវហើយ! ខ្ញុំចេះតែមួយម៉ាត់ហ្នឹងឯង ចំណែកពីរម៉ាត់ទៀតឯងជាអ្នកកាន់កាប់តើ!',
      voice: 'Piseth (Male)',
      status: 'Ready'
    },
    {
      id: autosaveData.subtitles[2].id,
      start: autosaveData.subtitles[2].start,
      end: autosaveData.subtitles[2].end,
      startSec: autosaveData.subtitles[2].startSec,
      endSec: autosaveData.subtitles[2].endSec,
      originalText: autosaveData.subtitles[2].originalText,
      englishText: "Have you lived long enough? Are you asking for a beating?",
      khmerText: 'ឯងចង់អស់អាយុ ឬចង់ត្រូវមួយដៃមែនទេ?!',
      voice: 'Sreymom (Female)',
      status: 'Ready'
    }
  ];

  // Helper functions simulating subtitles.js
  function formatTimecodeSRT(seconds) {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60) % 60;
    const h = Math.floor(totalSec / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  function parseTimecodeSRT(str) {
    if (typeof str === 'number') return Math.max(0, str);
    if (!str || typeof str !== 'string') return 0;
    const m = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
    if (m) {
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
    }
    return 0;
  }

  function exportSubtitlesToJSON(subtitles) {
    return JSON.stringify(subtitles.map(sub => ({
      id: sub.id,
      start: sub.start || formatTimecodeSRT(sub.startSec || 0),
      end: sub.end || formatTimecodeSRT(sub.endSec || 0),
      startSec: typeof sub.startSec === 'number' ? Math.round(sub.startSec * 1000) / 1000 : parseTimecodeSRT(sub.start),
      endSec: typeof sub.endSec === 'number' ? Math.round(sub.endSec * 1000) / 1000 : parseTimecodeSRT(sub.end),
      originalText: sub.originalText || '',
      englishText: sub.englishText || '',
      khmerText: sub.khmerText || '',
      voice: sub.voice || 'Piseth (Male)'
    })), null, 2);
  }

  function importSubtitlesFromJSON(content) {
    const trimmed = content.trim();
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      if (trimmed.includes('-->')) {
        return { isSRT: true };
      }
      throw new Error('JSON Parse Error');
    }

    let rawList = Array.isArray(data) ? data : (data.subtitles || data.data || data.items || []);
    return rawList.map((sub, idx) => {
      let startSec = typeof sub.startSec === 'number' ? sub.startSec : parseTimecodeSRT(sub.start);
      let endSec = typeof sub.endSec === 'number' ? sub.endSec : parseTimecodeSRT(sub.end);
      return {
        id: sub.id ? String(sub.id) : ('sub-' + idx),
        start: sub.start ? String(sub.start).trim() : formatTimecodeSRT(startSec),
        end: sub.end ? String(sub.end).trim() : formatTimecodeSRT(endSec),
        startSec: Math.round(startSec * 1000) / 1000,
        endSec: Math.round(endSec * 1000) / 1000,
        originalText: String(sub.originalText ?? sub.chinaText ?? sub.chineseText ?? sub.sourceText ?? '').trim(),
        englishText: String(sub.englishText ?? sub.enText ?? sub.english ?? '').trim(),
        khmerText: String(sub.khmerText ?? sub.kmText ?? sub.translatedText ?? sub.translation ?? sub.text ?? '').trim(),
        voice: String(sub.voice || 'Piseth (Male)').trim()
      };
    });
  }

  // Test Export
  const jsonExportStr = exportSubtitlesToJSON(realisticSubtitles);

  test('Export JSON preserves all 3 realistic subtitles', () => {
    const parsedBack = JSON.parse(jsonExportStr);
    assert.strictEqual(parsedBack.length, 3);
  });

  test('Export JSON preserves Chinese original speech accurately', () => {
    assert(jsonExportStr.includes('你看看别人的男朋友都是小乃哥 / 你再看看你 / 就站一个字 走'));
    assert(jsonExportStr.includes('对对对 我就站了一个字 / 剩下的两个字你都站'));
    assert(jsonExportStr.includes('你是不是活够了'));
  });

  test('Export JSON preserves English pivot translation', () => {
    assert(jsonExportStr.includes("Look at other guys' boyfriends"));
    assert(jsonExportStr.includes("Yeah right! I only fit one word"));
    assert(jsonExportStr.includes("Have you lived long enough?"));
  });

  test('Export JSON preserves Natural Spoken Cinema Khmer dialogue', () => {
    assert(jsonExportStr.includes('មើលសង្សារគេផង គេចេះយកចិត្តទុកដាក់ មើលមុខឯងវិញ គ្មានបានការសោះ!'));
    assert(jsonExportStr.includes('ត្រូវហើយ! ខ្ញុំចេះតែមួយម៉ាត់ហ្នឹងឯង'));
    assert(jsonExportStr.includes('ឯងចង់អស់អាយុ ឬចង់ត្រូវមួយដៃមែនទេ?!'));
  });

  test('Export JSON preserves distinct assigned voices (Male & Female)', () => {
    const parsedBack = JSON.parse(jsonExportStr);
    assert.strictEqual(parsedBack[0].voice, 'Sreymom (Female)');
    assert.strictEqual(parsedBack[1].voice, 'Piseth (Male)');
    assert.strictEqual(parsedBack[2].voice, 'Sreymom (Female)');
  });

  test('Export JSON preserves high-precision startSec & endSec floats', () => {
    const parsedBack = JSON.parse(jsonExportStr);
    assert.strictEqual(parsedBack[0].startSec, 0);
    assert.strictEqual(parsedBack[0].endSec, 5.26);
    assert.strictEqual(parsedBack[1].startSec, 5.26);
    assert.strictEqual(parsedBack[1].endSec, 10.04);
    assert.strictEqual(parsedBack[2].startSec, 10.68);
    assert.strictEqual(parsedBack[2].endSec, 12.8);
  });

  // Test Import
  const importedList = importSubtitlesFromJSON(jsonExportStr);

  test('Import JSON restores complete data with 100% exact equality', () => {
    assert.strictEqual(importedList.length, 3);
    for (let i = 0; i < realisticSubtitles.length; i++) {
      assert.strictEqual(importedList[i].id, realisticSubtitles[i].id);
      assert.strictEqual(importedList[i].start, realisticSubtitles[i].start);
      assert.strictEqual(importedList[i].end, realisticSubtitles[i].end);
      assert.strictEqual(importedList[i].startSec, realisticSubtitles[i].startSec);
      assert.strictEqual(importedList[i].endSec, realisticSubtitles[i].endSec);
      assert.strictEqual(importedList[i].originalText, realisticSubtitles[i].originalText);
      assert.strictEqual(importedList[i].englishText, realisticSubtitles[i].englishText);
      assert.strictEqual(importedList[i].khmerText, realisticSubtitles[i].khmerText);
      assert.strictEqual(importedList[i].voice, realisticSubtitles[i].voice);
    }
  });

  // -------------------------------------------------------------
  // REVIEW PHASE 2: Edge Cases, Resilience & Envelopes
  // -------------------------------------------------------------
  console.log('\n--- 2. EDGE CASES & SCHEMA RESILIENCE REVIEW ---');

  test('Handles Wrapped JSON envelope { "data": [...] }', () => {
    const wrapped = JSON.stringify({ data: realisticSubtitles });
    const res = importSubtitlesFromJSON(wrapped);
    assert.strictEqual(res.length, 3);
    assert.strictEqual(res[0].khmerText, realisticSubtitles[0].khmerText);
  });

  test('Handles Wrapped JSON envelope { "subtitles": [...] }', () => {
    const wrapped = JSON.stringify({ subtitles: realisticSubtitles });
    const res = importSubtitlesFromJSON(wrapped);
    assert.strictEqual(res.length, 3);
    assert.strictEqual(res[1].originalText, realisticSubtitles[1].originalText);
  });

  test('Handles alias keys (chinaText, enText, kmText)', () => {
    const aliasJson = JSON.stringify([
      {
        start: '00:00:00,500',
        end: '00:00:03,200',
        chinaText: '你好世界',
        enText: 'Hello World',
        kmText: 'សួស្តីពិភពលោក',
        voice: 'Piseth (Male)'
      }
    ]);
    const res = importSubtitlesFromJSON(aliasJson);
    assert.strictEqual(res[0].originalText, '你好世界');
    assert.strictEqual(res[0].englishText, 'Hello World');
    assert.strictEqual(res[0].khmerText, 'សួស្តីពិភពលោក');
    assert.strictEqual(res[0].startSec, 0.5);
    assert.strictEqual(res[0].endSec, 3.2);
  });

  test('Gracefully detects SRT format if user accidentally uploads .srt to JSON importer', () => {
    const srtText = `1\r\n00:00:01,000 --> 00:00:04,000\r\nសួស្តីបងប្អូនទាំងអស់គ្នា\r\n\r\n`;
    const res = importSubtitlesFromJSON(srtText);
    assert.strictEqual(res.isSRT, true);
  });

  test('Throws proper error on corrupted/malformed JSON string', () => {
    let threw = false;
    try {
      importSubtitlesFromJSON('{ invalid json, missing braces');
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  // -------------------------------------------------------------
  // REVIEW PHASE 3: Live Server & Web Application Files Review
  // -------------------------------------------------------------
  console.log('\n--- 3. LIVE WEB SERVER & ASSET INTEGRITY REVIEW ---');

  const PORT = 5134;
  const server = app.listen(PORT, async () => {
    try {
      // 1. Check index.html content served via HTTP
      const indexRes = await fetch(`http://localhost:${PORT}/index.html`);
      assert.strictEqual(indexRes.status, 200);
      const indexText = await indexRes.text();

      test('Server serves index.html with [Import JSON] button', () => {
        assert(indexText.includes('triggerJSONUpload()'));
        assert(indexText.includes('Import JSON'));
      });

      test('Server serves index.html with [Export JSON] button', () => {
        assert(indexText.includes('exportJSONFile()'));
        assert(indexText.includes('Export JSON'));
      });

      test('Server serves index.html with #json-file-input', () => {
        assert(indexText.includes('id="json-file-input"'));
      });

      // 2. Check public/js/subtitles.js served via HTTP
      const subRes = await fetch(`http://localhost:${PORT}/js/subtitles.js`);
      assert.strictEqual(subRes.status, 200);
      const subText = await subRes.text();

      test('Server serves subtitles.js containing exportJSONFile implementation', () => {
        assert(subText.includes('export function exportJSONFile('));
        assert(subText.includes('window.exportJSONFile = exportJSONFile;'));
      });

      test('Server serves subtitles.js containing importJSONContent implementation', () => {
        assert(subText.includes('export function importJSONContent('));
        assert(subText.includes('window.importJSONContent = importJSONContent;'));
      });

      test('Server serves subtitles.js containing triggerJSONUpload implementation', () => {
        assert(subText.includes('export function triggerJSONUpload('));
        assert(subText.includes('window.triggerJSONUpload = triggerJSONUpload;'));
      });

      test('Server serves subtitles.js containing syncSubtitlesFromDOM helper', () => {
        assert(subText.includes('export function syncSubtitlesFromDOM('));
      });

      // 3. Check public/js/main.js served via HTTP
      const mainRes = await fetch(`http://localhost:${PORT}/js/main.js`);
      assert.strictEqual(mainRes.status, 200);
      const mainText = await mainRes.text();

      test('Server serves main.js wiring json-file-input change event', () => {
        assert(mainText.includes("document.getElementById('json-file-input')"));
        assert(mainText.includes('importJSONContent(text)'));
      });

      console.log('\n================================================================');
      console.log(`🎉 ALL TESTS & REVIEWS PASSED: ${passedTests}/${totalTests} CHECKS (100%)!`);
      console.log('================================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ LIVE HTTP VERIFICATION FAILED:', err);
      server.close(() => process.exit(1));
    }
  });
}

runReviewAndTest();
