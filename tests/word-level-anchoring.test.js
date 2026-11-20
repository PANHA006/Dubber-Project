const assert = require('assert');

console.log('🧪 Testing Word-Level Speech Anchoring...\n');

// Mock data replicating the S01E001 video scenario
// Segment has music from 0.00s to 4.64s, and first word starts at 4.64s
const mockSegments = [
  {
    start: 0.00,
    end: 6.84,
    text: "小实习生脸这么红",
    words: [
      { word: "小", start: 4.64, end: 5.00 },
      { word: "实习生", start: 5.00, end: 5.58 },
      { word: "脸这么红", start: 5.90, end: 6.72 }
    ]
  }
];

// Test Freeze Mode Word Anchoring logic:
const maxMergeLimit = 1;
const result = mockSegments
  .filter(seg => (seg.text || '').trim().length > 0)
  .map(seg => {
    let segStart = typeof seg.start === 'number' ? seg.start : 0;
    let segEnd = typeof seg.end === 'number' ? seg.end : segStart + 1;

    const segWords = Array.isArray(seg.words) ? seg.words : [];
    if (segWords.length > 0 && typeof segWords[0].start === 'number') {
      segStart = segWords[0].start;
      const lastWord = segWords[segWords.length - 1];
      if (typeof lastWord.end === 'number' && lastWord.end > segStart) {
        segEnd = lastWord.end;
      }
    }

    return {
      startSec: Math.round(segStart * 1000) / 1000,
      endSec: Math.round(segEnd * 1000) / 1000,
      text: (seg.text || '').trim()
    };
  });

assert.strictEqual(result[0].startSec, 4.64, 'Start time MUST anchor to first spoken word (4.64s), NOT music start (0.00s)');
assert.strictEqual(result[0].endSec, 6.72, 'End time MUST anchor to last spoken word (6.72s)');
console.log('✅ PASS: Word-level speech anchor correctly eliminated 4.64s leading music gap');

console.log('\n🎉 ALL WORD ANCHORING TESTS PASSED SUCCESSFULLY!');
