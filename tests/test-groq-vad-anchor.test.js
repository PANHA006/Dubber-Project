/**
 * Test Suite: Groq Speech Filter & Direct Silero VAD Multi-Segment Anchoring
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const groqService = require('../src/services/groq.service');

console.log('\n======================================================');
console.log('   🎯 TESTING GROQ SPEECH FILTER & VAD ANCHORING      ');
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

const groqSource = fs.readFileSync(path.join(__dirname, '../src/services/groq.service.js'), 'utf-8');

it('groq.service.js applies FFmpeg speech bandpass + noise filter before Groq upload', () => {
  assert.ok(groqSource.includes('highpass=f=200,lowpass=f=3500,afftdn=nf=-25'), 'Must include speech filter');
});

it('groq.service.js uses faster_whisper.vad directly without loading WhisperModel', () => {
  assert.ok(groqSource.includes('faster_whisper.vad'), 'Must use faster_whisper.vad');
  assert.ok(!groqSource.includes("WhisperModel('tiny'"), 'Must not load WhisperModel tiny for VAD');
});

it('alignSegmentsToSpeechIntervals trims leading BGM on Segment 1 and mid-video segments', () => {
  const segments = [
    { startSec: 0.0, endSec: 6.5, text: 'Intro line after music' },
    { startSec: 10.0, endSec: 15.0, text: 'Mid-video line after BGM' },
    { startSec: 20.0, endSec: 23.0, text: 'Already aligned line' }
  ];
  const speechIntervals = [
    { start: 3.25, end: 6.4 },
    { start: 12.4, end: 14.9 },
    { start: 20.02, end: 22.9 }
  ];

  const { anchoredCount } = groqService.alignSegmentsToSpeechIntervals(segments, speechIntervals);
  assert.strictEqual(anchoredCount, 2, 'Should anchor Segment 1 and Segment 2, leaving Segment 3 untouched');
  assert.strictEqual(segments[0].startSec, 3.25);
  assert.strictEqual(segments[1].startSec, 12.4);
  assert.strictEqual(segments[2].startSec, 20.0);
});

it('alignSegmentsToSpeechIntervals ignores tiny speech intervals that would invert start/end', () => {
  const segments = [
    { startSec: 5.0, endSec: 5.2, text: 'Short utterance' }
  ];
  const speechIntervals = [
    { start: 5.15, end: 5.2 }
  ];

  const { anchoredCount } = groqService.alignSegmentsToSpeechIntervals(segments, speechIntervals);
  assert.strictEqual(anchoredCount, 0);
  assert.strictEqual(segments[0].startSec, 5.0);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
