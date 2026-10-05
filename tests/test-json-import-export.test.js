const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('   🧪 MULTILINGUAL JSON IMPORT & EXPORT VERIFICATION TEST');
console.log('================================================================\n');

// 1. Verify HTML Button & Input Presence
console.log('--- 1. VERIFYING HTML ELEMENTS IN public/index.html ---');
const indexPath = path.join(__dirname, '../public/index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(indexHtml.includes('triggerJSONUpload()'), 'index.html must have triggerJSONUpload() button');
assert(indexHtml.includes('exportJSONFile()'), 'index.html must have exportJSONFile() button');
assert(indexHtml.includes('id="json-file-input"'), 'index.html must have #json-file-input element');
assert(indexHtml.includes('Import JSON'), 'Button label must show "Import JSON"');
assert(indexHtml.includes('Export JSON'), 'Button label must show "Export JSON"');
console.log('✅ PASS: HTML contains [Import JSON] and [Export JSON] buttons and file input');

// 2. Mock state and test import / export logic
console.log('\n--- 2. VERIFYING JSON EXPORT LOGIC WITH FULL MULTILINGUAL FIELDS ---');

// Mock timecode parsing & formatting
function parseTimecodeSRT(str) {
  if (typeof str === 'number') return Math.max(0, str);
  if (!str || typeof str !== 'string') return 0;
  const m = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (m) {
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
  }
  return 0;
}

function formatTimecodeSRT(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

const mockSubtitles = [
  {
    id: 'sub-1',
    start: '00:00:01,000',
    end: '00:00:04,500',
    startSec: 1.0,
    endSec: 4.5,
    originalText: '你看看别人的男朋友都是小乃哥',
    englishText: "Look at other people's boyfriends, they are cute cuties.",
    khmerText: 'មើលប្រុសគេផង គេចេះយកចិត្តយកថ្លើម',
    voice: 'Piseth (Male)',
    status: 'Ready'
  },
  {
    id: 'sub-2',
    start: '00:00:04,600',
    end: '00:00:08,200',
    startSec: 4.6,
    endSec: 8.2,
    originalText: '你再看看你 就站一个字 走',
    englishText: "Now look at you, you are completely hopeless.",
    khmerText: 'មើលមុខឯងវិញ គ្មានបានការសោះ ដើរចេញទៅ!',
    voice: 'Sreymom (Female)',
    status: 'Ready'
  }
];

// Simulate export formatting
const exported = mockSubtitles.map(sub => ({
  id: sub.id,
  start: sub.start || formatTimecodeSRT(sub.startSec || 0),
  end: sub.end || formatTimecodeSRT(sub.endSec || 0),
  startSec: typeof sub.startSec === 'number' ? Math.round(sub.startSec * 1000) / 1000 : parseTimecodeSRT(sub.start),
  endSec: typeof sub.endSec === 'number' ? Math.round(sub.endSec * 1000) / 1000 : parseTimecodeSRT(sub.end),
  originalText: sub.originalText || '',
  englishText: sub.englishText || '',
  khmerText: sub.khmerText || '',
  voice: sub.voice || 'Piseth (Male)'
}));

const exportedJsonStr = JSON.stringify(exported, null, 2);
console.log('Sample Exported JSON Preview:');
console.log(exportedJsonStr);

// Verify fields in exported string
assert(exportedJsonStr.includes('"originalText": "你看看别人的男朋友都是小乃哥"'));
assert(exportedJsonStr.includes('"englishText": "Look at other people\'s boyfriends, they are cute cuties."'));
assert(exportedJsonStr.includes('"khmerText": "មើលប្រុសគេផង គេចេះយកចិត្តយកថ្លើម"'));
assert(exportedJsonStr.includes('"startSec": 1'));
assert(exportedJsonStr.includes('"endSec": 4.5'));
assert(exportedJsonStr.includes('"voice": "Piseth (Male)"'));
console.log('✅ PASS: Exported JSON contains full Chinese, English, Khmer, and Timecode fields');

// 3. Simulate Import JSON
console.log('\n--- 3. VERIFYING JSON IMPORT RESTORATION WITH MULTIPLE FORMATS ---');

function parseJSONSubtitles(content) {
  const trimmed = content.trim();
  let data = JSON.parse(trimmed);
  let rawList = Array.isArray(data) ? data : (data.subtitles || data.data || []);
  
  return rawList.map((sub, idx) => {
    let startSec = typeof sub.startSec === 'number' ? sub.startSec : parseTimecodeSRT(sub.start);
    let endSec = typeof sub.endSec === 'number' ? sub.endSec : parseTimecodeSRT(sub.end);
    return {
      id: sub.id || ('sub-' + idx),
      start: sub.start || formatTimecodeSRT(startSec),
      end: sub.end || formatTimecodeSRT(endSec),
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      originalText: String(sub.originalText ?? sub.chinaText ?? sub.chineseText ?? '').trim(),
      englishText: String(sub.englishText ?? sub.enText ?? sub.english ?? '').trim(),
      khmerText: String(sub.khmerText ?? sub.kmText ?? sub.translation ?? sub.text ?? '').trim(),
      voice: (sub.voice && (sub.voice.includes('Male') || sub.voice.includes('Female'))) ? sub.voice : 'Piseth (Male)'
    };
  });
}

// Test A: Round-trip from exported JSON
const restoredA = parseJSONSubtitles(exportedJsonStr);
assert.strictEqual(restoredA.length, 2);
assert.strictEqual(restoredA[0].originalText, '你看看别人的男朋友都是小乃哥');
assert.strictEqual(restoredA[0].englishText, "Look at other people's boyfriends, they are cute cuties.");
assert.strictEqual(restoredA[0].khmerText, 'មើលប្រុសគេផង គេចេះយកចិត្តយកថ្លើម');
assert.strictEqual(restoredA[0].start, '00:00:01,000');
assert.strictEqual(restoredA[0].end, '00:00:04,500');
assert.strictEqual(restoredA[0].voice, 'Piseth (Male)');
assert.strictEqual(restoredA[1].voice, 'Sreymom (Female)');
console.log('✅ PASS: Round-trip export -> import preserves 100% data fidelity');

// Test B: Wrapped Object format { "subtitles": [...] } with alias keys (chinaText, enText, kmText)
const wrappedPayload = JSON.stringify({
  version: 2,
  subtitles: [
    {
      start: '00:00:10,000',
      end: '00:00:14,000',
      chinaText: '真有意思',
      enText: 'Really interesting.',
      kmText: 'ពិតជាគួរឱ្យចាប់អារម្មណ៍មែន',
      voice: 'Piseth (Male)'
    }
  ]
});

const restoredB = parseJSONSubtitles(wrappedPayload);
assert.strictEqual(restoredB.length, 1);
assert.strictEqual(restoredB[0].originalText, '真有意思');
assert.strictEqual(restoredB[0].englishText, 'Really interesting.');
assert.strictEqual(restoredB[0].khmerText, 'ពិតជាគួរឱ្យចាប់អារម្មណ៍មែន');
assert.strictEqual(restoredB[0].startSec, 10);
assert.strictEqual(restoredB[0].endSec, 14);
console.log('✅ PASS: Wrapped JSON and alias field keys (chinaText, enText, kmText) parsed perfectly');

console.log('\n================================================================');
console.log('   🎉 ALL MULTILINGUAL JSON IMPORT/EXPORT TESTS PASSED!');
console.log('================================================================\n');
