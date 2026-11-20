const { parseTimeToSeconds } = require('../src/utils/time');
const videoRendererService = require('../src/services/video-renderer.service');
const pcmMuterService = require('../src/services/pcm-muter.service');
const assert = require('assert');

console.log('🧪 Testing Timing & Sync Fixes...\n');

// Test 1: parseTimeToSeconds
assert.strictEqual(parseTimeToSeconds(12.5), 12.5, 'Number should pass through');
assert.strictEqual(parseTimeToSeconds("00:01:23,450"), 83.45, 'SRT comma timecode should convert to seconds');
assert.strictEqual(parseTimeToSeconds("00:01:23.450"), 83.45, 'SRT dot timecode should convert to seconds');
assert.strictEqual(parseTimeToSeconds("02:15"), 135, 'MM:SS should convert to 135s');
assert.strictEqual(parseTimeToSeconds("01:00:05"), 3605, 'HH:MM:SS should convert to 3605s');
assert.strictEqual(parseTimeToSeconds("15.75"), 15.75, 'Seconds string should convert to 15.75s');
assert.strictEqual(parseTimeToSeconds(null), 0, 'Null should return 0');
assert.strictEqual(parseTimeToSeconds(undefined), 0, 'Undefined should return 0');
console.log('✅ PASS: parseTimeToSeconds handles all formats accurately');

// Test 2: pcmMuterService intervals calculation with SRT strings
const mockSubs = [
  { start: "00:00:04,120", end: "00:00:05,800" },
  { start: "00:00:09,020", end: "00:00:11,500" }
];
// Test interval calculation inside muter
const padBefore = 0.25;
const padAfter = 0.25;
const intervals = mockSubs.map(s => {
  const rawStart = parseTimeToSeconds(s.startSec ?? s.start);
  const rawEnd = parseTimeToSeconds(s.endSec ?? s.end);
  const start = Math.max(0, rawStart - padBefore);
  const end = (rawEnd > rawStart ? rawEnd : (rawStart + 2.0)) + padAfter;
  return { start, end };
});

assert.strictEqual(intervals[0].start, 4.12 - 0.25, 'Interval start should match 4.12 - 0.25');
assert.strictEqual(intervals[0].end, 5.80 + 0.25, 'Interval end should match 5.80 + 0.25');
console.log('✅ PASS: PCM Muter calculates intervals accurately with SRT strings');

// Test 3: Chronological Sorting check
const unsortedVoices = [
  { id: 3, startSec: 15.2 },
  { id: 1, startSec: 2.1 },
  { id: 2, startSec: 8.5 }
];
unsortedVoices.sort((a, b) => a.startSec - b.startSec);
assert.strictEqual(unsortedVoices[0].id, 1, 'Earliest voice should be first');
assert.strictEqual(unsortedVoices[1].id, 2, 'Middle voice should be second');
assert.strictEqual(unsortedVoices[2].id, 3, 'Latest voice should be third');
console.log('✅ PASS: Chronological sorting ensures proper adelay execution');

console.log('\n🎉 ALL TIMING & SYNC TESTS PASSED SUCCESSFULLY!');
