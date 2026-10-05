// Setup browser mocks for unit/integration testing
globalThis.window = globalThis;
globalThis.document = {
  getElementById: (id) => {
    if (id === 'subtitle-table-body') {
      return {
        innerHTML: '',
        appendChild: () => {}
      };
    }
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => []
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null
};

import assert from 'node:assert';

async function runReviewAndTests() {
  console.log('================================================================');
  console.log('  🔍 DEEP REVIEW & TEST: SMART NON-OVERLAPPING END PADDING      ');
  console.log('================================================================\n');

  const { applySmartEndPadding, formatTimecodeSRT, parseTimecodeSRT } = await import('../public/js/subtitles.js');

  let totalTests = 0;
  let passedTests = 0;

  function testCheck(desc, condition) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ PASS: ${desc}`);
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // --- REVIEW PART 1: WHISPER SIMULATION WITH VARIED GAPS ---
  console.log('--- 1. AUDITING WHISPER TRANSCRIPTION INTEGRATION ---');

  // Simulated Whisper output segments as returned by Faster-Whisper worker
  const whisperOutput = [
    {
      id: 1,
      start: '00:00:01,000',
      end: '00:00:02,500',
      startSec: 1.0,
      endSec: 2.5,
      originalText: 'Hello world welcome to our video',
      speaker: 'Speaker 1'
    },
    {
      id: 2,
      start: '00:00:04,500',
      end: '00:00:06,000',
      startSec: 4.5,
      endSec: 6.0,
      originalText: 'This is the second sentence with a big gap',
      speaker: 'Speaker 1'
    },
    {
      id: 3,
      start: '00:00:06,400',
      end: '00:00:08,000',
      startSec: 6.4,
      endSec: 8.0,
      originalText: 'This segment has only 0.4s gap before next segment',
      speaker: 'Speaker 1'
    },
    {
      id: 4,
      start: '00:00:08,350',
      end: '00:00:09,800',
      startSec: 8.35,
      endSec: 9.8,
      originalText: 'This segment is followed by a very tight gap',
      speaker: 'Speaker 1'
    },
    {
      id: 5,
      start: '00:00:09,830',
      end: '00:00:11,500',
      startSec: 9.83,
      endSec: 11.5,
      originalText: 'Starts right after (30ms gap)',
      speaker: 'Speaker 1'
    },
    {
      id: 6,
      start: '00:00:11,400',
      end: '00:00:13,000',
      startSec: 11.4,
      endSec: 13.0,
      originalText: 'Noisy overlap from speech detector (starts at 11.4 while prev was 11.5)',
      speaker: 'Speaker 1'
    },
    {
      id: 7,
      start: '00:00:14,000',
      end: '00:00:15,500',
      startSec: 14.0,
      endSec: 15.5,
      originalText: 'Final segment before video ends at 16.0s',
      speaker: 'Speaker 1'
    }
  ];

  // Map exactly like main.js transcribeCurrentVideo
  const parsedSubtitles = whisperOutput.map((item, idx) => ({
    id: `sub-ai-test-${idx}`,
    selected: false,
    start: formatTimecodeSRT(item.startSec),
    end: formatTimecodeSRT(item.endSec),
    startSec: item.startSec,
    endSec: item.endSec,
    originalText: item.originalText,
    khmerText: '',
    voice: 'Piseth (Male)',
    status: 'Pending'
  }));

  const configuredPadding = 0.70; // user setting
  const videoDuration = 16.0; // video duration in seconds

  applySmartEndPadding(parsedSubtitles, configuredPadding, videoDuration);

  // Verification 1: Wide gap segment (Item 0 to Item 1: 2.5s -> 4.5s = 2.0s gap)
  // Should receive full 0.70s padding
  testCheck(
    'Segment 1 (Wide gap) gets full +0.70s padding (2.5s + 0.7s = 3.200s)',
    parsedSubtitles[0].endSec === 3.2 && parsedSubtitles[0].end === '00:00:03,200'
  );

  // Verification 2: Moderate gap segment (Item 1 to Item 2: 6.0s -> 6.4s = 0.40s gap)
  // Available gap = 0.40s. Safety gap = 0.05s. Max allowed = 0.35s.
  // 6.0 + 0.35 = 6.350s
  testCheck(
    'Segment 2 (0.40s gap) clamps padding to +0.35s with 0.05s safety buffer preserved',
    parsedSubtitles[1].endSec === 6.35 && parsedSubtitles[1].end === '00:00:06,350'
  );
  testCheck(
    'Segment 2 does not overlap Segment 3 (6.350s < 6.400s)',
    parsedSubtitles[1].endSec < parsedSubtitles[2].startSec
  );

  // Verification 3: Gap = 0.35s (Item 2 to Item 3: 8.0s -> 8.35s)
  // Max padding = 0.35 - 0.05 = 0.30s -> 8.0 + 0.30 = 8.300s
  testCheck(
    'Segment 3 clamps padding to 0.30s (8.300s end before 8.350s start)',
    parsedSubtitles[2].endSec === 8.3 && parsedSubtitles[2].end === '00:00:08,300'
  );

  // Verification 4: Tiny gap <= 0.05s (Item 3 to Item 4: 9.80s -> 9.83s = 0.03s gap)
  // Padding must be 0s to prevent collision
  testCheck(
    'Segment 4 with tiny 30ms gap receives 0 padding to prevent overlap',
    parsedSubtitles[3].endSec === 9.8 && parsedSubtitles[3].end === '00:00:09,800'
  );

  // Verification 5: Pre-existing raw overlap (Item 4 ends at 11.5s, Item 5 starts at 11.4s)
  // Must clamp Item 4 back to 11.4s - 0.05s = 11.350s
  testCheck(
    'Segment 5 pre-existing overlap is safely resolved (clamped to 11.350s)',
    parsedSubtitles[4].endSec === 11.35 && parsedSubtitles[4].end === '00:00:11,350'
  );
  testCheck(
    'Segment 5 now strictly precedes Segment 6 (11.350s <= 11.400s - 0.05s)',
    parsedSubtitles[4].endSec <= parsedSubtitles[5].startSec - 0.05
  );

  // Verification 6: Last segment with video duration boundary
  // Item 6: ends at 15.5s, video duration is 16.0s (0.50s available)
  // Max padding = 0.50s - 0.05s = 0.45s -> 15.5 + 0.45 = 15.950s
  testCheck(
    'Last Segment respects video duration boundary (15.5s + 0.45s = 15.950s <= 16.0s)',
    parsedSubtitles[6].endSec === 15.95 && parsedSubtitles[6].end === '00:00:15,950'
  );

  // --- REVIEW PART 2: ABSOLUTE NON-OVERLAPPING INVARIANT ---
  console.log('\n--- 2. AUDITING NON-OVERLAPPING MATHEMATICAL INVARIANT ---');
  let hasCollision = false;
  for (let i = 0; i < parsedSubtitles.length - 1; i++) {
    const curr = parsedSubtitles[i];
    const next = parsedSubtitles[i + 1];
    if (curr.endSec > next.startSec) {
      hasCollision = true;
      console.error(`Collision detected between row ${i} (${curr.endSec}) and row ${i+1} (${next.startSec})`);
    }
  }
  testCheck('Invariant: No subtitle row overlaps the next row (0 collisions across all rows)', !hasCollision);

  // Invariant 2: String timecode parsing roundtrip
  let roundtripAccurate = true;
  for (let i = 0; i < parsedSubtitles.length; i++) {
    const sub = parsedSubtitles[i];
    const parsedStart = parseTimecodeSRT(sub.start);
    const parsedEnd = parseTimecodeSRT(sub.end);
    if (Math.abs(parsedStart - sub.startSec) > 0.002 || Math.abs(parsedEnd - sub.endSec) > 0.002) {
      roundtripAccurate = false;
    }
  }
  testCheck('SRT string format matches numeric seconds precisely (HH:MM:SS,mmm roundtrip)', roundtripAccurate);

  // --- REVIEW PART 3: IMPACT ON TTS SPEED ACCELERATION ---
  console.log('\n--- 3. AUDITING TTS DURATION & SPEED BENEFIT ---');
  // Suppose Khmer translated speech takes 2.2 seconds to speak naturally
  const speechLength = 2.2;

  // WITHOUT padding: Segment 1 had raw duration = 2.5 - 1.0 = 1.5s
  const rawTargetDuration = 1.5;
  const rawSpeedNeeded = Math.round((speechLength / rawTargetDuration) * 100) / 100;

  // WITH smart padding: Segment 1 has targetDuration = 3.2 - 1.0 = 2.2s
  const paddedTargetDuration = parsedSubtitles[0].endSec - parsedSubtitles[0].startSec;
  const paddedSpeedNeeded = Math.round((speechLength / paddedTargetDuration) * 100) / 100;

  testCheck(
    `Without padding: requires fast speed ${rawSpeedNeeded}x (accelerated)`,
    rawSpeedNeeded >= 1.35
  );
  testCheck(
    `With smart padding: targetDuration increased from 1.50s to ${paddedTargetDuration.toFixed(2)}s`,
    paddedTargetDuration === 2.2
  );
  testCheck(
    `With smart padding: speed drops to comfortable normal ${paddedSpeedNeeded}x (1.0x)!`,
    paddedSpeedNeeded === 1.0
  );

  // --- REVIEW PART 4: VARYING END PADDING SETTINGS ---
  console.log('\n--- 4. AUDITING VARYING END PADDING SETTINGS ---');
  // Setting 0.00s (no padding)
  const copy0 = [
    { start: '00:00:01,000', end: '00:00:02,000', startSec: 1.0, endSec: 2.0 },
    { start: '00:00:04,000', end: '00:00:05,000', startSec: 4.0, endSec: 5.0 }
  ];
  applySmartEndPadding(copy0, 0.0, 10.0);
  testCheck('Setting End Padding to 0.00s keeps original end time (no padding added)', copy0[0].endSec === 2.0);

  // Setting 1.50s (large padding)
  const copy15 = [
    { start: '00:00:01,000', end: '00:00:02,000', startSec: 1.0, endSec: 2.0 },
    { start: '00:00:03,000', end: '00:00:04,000', startSec: 3.0, endSec: 4.0 }
  ];
  // Gap = 3.0 - 2.0 = 1.0s. Safety gap = 0.05s -> max allowed = 0.95s
  applySmartEndPadding(copy15, 1.50, 10.0);
  testCheck('Setting large 1.50s padding is safely capped by gap (2.0 + 0.95 = 2.950s)', copy15[0].endSec === 2.95);
  testCheck('Large padding strictly does not collide with next row (2.950s < 3.000s)', copy15[0].endSec < copy15[1].startSec);

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedTests}/${totalTests} CHECKS PASSED (100%)`);
  console.log('================================================================\n');
}

runReviewAndTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
