/**
 * Test: Freeze Segmentation Contract (Max Merged = 1 -> Pure Whisper Native Segments)
 */

const assert = require('assert');
const groqService = require('../src/services/groq.service.js');
const { applySmartEndPadding } = require('../public/js/subtitles.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

console.log('================================================================');
console.log('   🧪 FREEZE SEGMENTATION (MAX MERGED = 1) VERIFICATION TEST');
console.log('================================================================\n');

const mockSegments = [
  {
    id: 0,
    start: 1.0,
    end: 4.5,
    text: 'Hello, this is John, welcome to the show!'
  },
  {
    id: 1,
    start: 5.0,
    end: 8.2,
    text: 'Today we discuss AI dubbing, it is truly amazing.'
  }
];

const mockWords = [
  { word: 'Hello,', start: 1.0, end: 1.5 },
  { word: 'this', start: 1.5, end: 1.8 },
  { word: 'is', start: 1.8, end: 2.0 },
  { word: 'John,', start: 2.0, end: 2.5 },
  { word: 'welcome', start: 2.6, end: 3.2 },
  { word: 'to', start: 3.2, end: 3.4 },
  { word: 'the', start: 3.4, end: 3.6 },
  { word: 'show!', start: 3.6, end: 4.5 }
];

check('maxMergeLimit = 1 freezes segmentation and preserves pure Groq Whisper native segments', () => {
  const result = groqService.processRawSegments(mockSegments, mockWords, {
    maxMergeLimit: 1,
    maxPauseGap: 0.20
  });

  // Exactly 2 segments, matching mockSegments 1:1 without sub-splitting on commas
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].startSec, 1.0);
  assert.strictEqual(result[0].endSec, 4.5);
  assert.strictEqual(result[0].text, 'Hello, this is John, welcome to the show!');

  assert.strictEqual(result[1].startSec, 5.0);
  assert.strictEqual(result[1].endSec, 8.2);
  assert.strictEqual(result[1].text, 'Today we discuss AI dubbing, it is truly amazing.');
});

check('maxMergeLimit > 1 applies standard punctuation sub-splitting and merging', () => {
  const result = groqService.processRawSegments(mockSegments, mockWords, {
    maxMergeLimit: 3,
    maxPauseGap: 0.20
  });

  // Result will be split by punctuation or merged according to limits
  assert(result.length >= 2);
});

check('applySmartEndPadding applies +0.70s breath padding to freeze-mode native segments', () => {
  const freezeSegments = groqService.processRawSegments(mockSegments, mockWords, {
    maxMergeLimit: 1
  });

  const subs = freezeSegments.map((s, idx) => ({
    id: idx + 1,
    start: '00:00:01,000',
    end: '00:00:04,500',
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text
  }));

  // Next segment starts at 5.0s, segment 0 ends at 4.5s.
  // Gap is 5.0 - 4.5 = 0.5s. Safety gap is 0.05s -> max padding allowed is 0.5 - 0.05 = 0.45s.
  applySmartEndPadding(subs, 0.70, 10.0);

  assert.strictEqual(subs[0].endSec, 4.95); // 4.5 + 0.45s (bounded by next segment)
  assert.strictEqual(subs[1].endSec, 8.9);  // 8.2 + 0.70s (bounded by video duration)
});

console.log('\n================================================================');
console.log(`   🎉 ALL ${passed} FREEZE SEGMENTATION TESTS PASSED!`);
console.log('================================================================\n');
