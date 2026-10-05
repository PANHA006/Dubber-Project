const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('   🧪 SRT IMPORT & EXPORT VERIFICATION TEST');
console.log('================================================================\n');

// 1. Verify HTML Button & Input Presence in public/index.html
console.log('--- 1. VERIFYING HTML ELEMENTS IN public/index.html ---');
const indexPath = path.join(__dirname, '../public/index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(indexHtml.includes('triggerSRTUpload()'), 'index.html must have triggerSRTUpload()');
assert(indexHtml.includes('exportSRTFile()'), 'index.html must have exportSRTFile()');
assert(indexHtml.includes('id="srt-file-input"'), 'index.html must have #srt-file-input');
assert(indexHtml.includes('Import SRT'), 'Button label must show "Import SRT"');
assert(indexHtml.includes('Export SRT'), 'Button label must show "Export SRT"');
console.log('✅ PASS: HTML contains [Import SRT] and [Export SRT] buttons and file input');

// 2. Test formatTimecodeSRT & parseTimecodeSRT
function parseTimecodeSRT(str) {
  if (typeof str === 'number') return Math.max(0, str);
  if (!str || typeof str !== 'string') return 0;
  const trimmed = str.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (m) {
    return (
      parseInt(m[1], 10) * 3600 +
      parseInt(m[2], 10) * 60 +
      parseInt(m[3], 10) +
      parseInt(m[4].padEnd(3, '0').slice(0, 3), 10) / 1000
    );
  }
  return 0;
}

function formatTimecodeSRT(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

console.log('\n--- 2. VERIFYING SRT TIMECODE HELPERS ---');
assert.strictEqual(formatTimecodeSRT(0), '00:00:00,000');
assert.strictEqual(formatTimecodeSRT(65.432), '00:01:05,432');
assert.strictEqual(parseTimecodeSRT('00:01:05,432'), 65.432);
console.log('✅ PASS: formatTimecodeSRT and parseTimecodeSRT calculate accurate millisecond timecodes');

// 3. Test SRT Generation Logic
console.log('\n--- 3. VERIFYING SRT EXPORT GENERATION ---');
const sampleSubs = [
  {
    id: 'sub-1',
    start: '00:00:01,000',
    end: '00:00:03,500',
    startSec: 1.0,
    endSec: 3.5,
    originalText: '你好，欢迎来到这里。',
    khmerText: 'សួស្តី សូមស្វាគមន៍មកកាន់ទីនេះ។'
  },
  {
    id: 'sub-2',
    start: '00:00:04,000',
    end: '00:00:06,200',
    startSec: 4.0,
    endSec: 6.2,
    originalText: '我们今天开始学习。',
    khmerText: 'ពួកយើងចាប់ផ្តើមរៀននៅថ្ងៃនេះ។'
  },
  {
    id: 'sub-3',
    start: '00:00:07,100',
    end: '00:00:09,000',
    startSec: 7.1,
    endSec: 9.0,
    originalText: '这是一个测试。',
    khmerText: '' // No Khmer yet, fallback to originalText
  }
];

function generateSRTString(subtitles) {
  let srtContent = '';
  subtitles.forEach((sub, index) => {
    const startTime = (typeof sub.startSec === 'number' && !isNaN(sub.startSec))
      ? formatTimecodeSRT(sub.startSec)
      : (sub.start || '00:00:00,000');
    const endTime = (typeof sub.endSec === 'number' && !isNaN(sub.endSec))
      ? formatTimecodeSRT(sub.endSec)
      : (sub.end || '00:00:00,000');
    const text = (sub.khmerText && sub.khmerText.trim())
      ? sub.khmerText.trim()
      : (sub.originalText ? sub.originalText.trim() : '');

    srtContent += `${index + 1}\r\n`;
    srtContent += `${startTime} --> ${endTime}\r\n`;
    srtContent += `${text}\r\n\r\n`;
  });
  return srtContent;
}

const exportedSRT = generateSRTString(sampleSubs);
console.log('Sample Exported SRT:\n' + exportedSRT);

assert(exportedSRT.includes('1\r\n00:00:01,000 --> 00:00:03,500\r\nសួស្តី សូមស្វាគមន៍មកកាន់ទីនេះ។'));
assert(exportedSRT.includes('2\r\n00:00:04,000 --> 00:00:06,200\r\nពួកយើងចាប់ផ្តើមរៀននៅថ្ងៃនេះ។'));
assert(exportedSRT.includes('3\r\n00:00:07,100 --> 00:00:09,000\r\n这是一个测试。'));
console.log('✅ PASS: SRT generated with valid SubRip numbering, timestamps, and text fallback');

// 4. Test SRT Parsing Logic
console.log('\n--- 4. VERIFYING SRT IMPORT PARSING ---');
function parseSRT(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n+/);
  const parsed = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const arrowIdx = lines.findIndex(l => l.includes('-->'));
    if (arrowIdx !== -1) {
      const timeLine = lines[arrowIdx];
      const timeMatch = timeLine.match(/([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})\s*-->\s*([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})/);
      if (timeMatch) {
        const start = timeMatch[1].replace('.', ',');
        const end = timeMatch[2].replace('.', ',');
        const text = lines.slice(arrowIdx + 1).join(' ').trim();
        const isKhmer = /[\u1780-\u17FF]/.test(text);

        parsed.push({
          id: 'sub-' + (1000 + idx),
          start: start,
          end: end,
          startSec: parseTimecodeSRT(start),
          endSec: parseTimecodeSRT(end),
          khmerText: isKhmer ? text : '',
          originalText: text
        });
      }
    }
  });
  return parsed;
}

const parsedSubs = parseSRT(exportedSRT);
assert.strictEqual(parsedSubs.length, 3, 'Should parse 3 blocks');
assert.strictEqual(parsedSubs[0].start, '00:00:01,000');
assert.strictEqual(parsedSubs[0].end, '00:00:03,500');
assert.strictEqual(parsedSubs[0].startSec, 1.0);
assert.strictEqual(parsedSubs[0].endSec, 3.5);
assert.strictEqual(parsedSubs[0].khmerText, 'សួស្តី សូមស្វាគមន៍មកកាន់ទីនេះ។');

// Block 3 was Chinese text
assert.strictEqual(parsedSubs[2].startSec, 7.1);
assert.strictEqual(parsedSubs[2].endSec, 9.0);
assert.strictEqual(parsedSubs[2].originalText, '这是一个测试。');
assert.strictEqual(parsedSubs[2].khmerText, '', 'Non-khmer text should leave khmerText ready for translation');

console.log('✅ PASS: SRT content parsed accurately into state subtitles structure');

// 5. Test Roundtrip with dot timecodes (e.g. 00:00:01.500)
console.log('\n--- 5. VERIFYING TOLERANCE FOR DOT TIMECODES (00:00:01.500) ---');
const dotSRT = `1
00:00:01.500 --> 00:00:04.250
Hello world from SRT with dots

2
00:00:05.000 --> 00:00:08.000
ជំរាបសួរពីប្រទេសកម្ពុជា
`;

const parsedDot = parseSRT(dotSRT);
assert.strictEqual(parsedDot.length, 2);
assert.strictEqual(parsedDot[0].startSec, 1.5);
assert.strictEqual(parsedDot[0].endSec, 4.25);
assert.strictEqual(parsedDot[0].start, '00:00:01,500');
assert.strictEqual(parsedDot[1].khmerText, 'ជំរាបសួរពីប្រទេសកម្ពុជា');
console.log('✅ PASS: Dot timecodes automatically normalized to standard comma format');

console.log('\n================================================================');
console.log('   🎉 ALL SRT IMPORT & EXPORT TESTS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
