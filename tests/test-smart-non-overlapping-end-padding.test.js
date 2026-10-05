// Setup browser globals before dynamically importing browser modules
globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null
};

import assert from 'node:assert';

async function run() {
  const { applySmartEndPadding, formatTimecodeSRT, parseTimecodeSRT } = await import('../public/js/subtitles.js');

  console.log('🧪 Starting Test Suite: Smart Non-Overlapping End Padding...\n');

  // Test Case 1: Wide gap -> receives full requested padding
  {
    const subtitles = [
      { id: '1', start: '00:00:01,000', end: '00:00:03,000', startSec: 1.0, endSec: 3.0 },
      { id: '2', start: '00:00:05,000', end: '00:00:07,000', startSec: 5.0, endSec: 7.0 },
    ];

    applySmartEndPadding(subtitles, 0.70, 10.0);

    // Row 1: gap to Row 2 is 5.0 - 3.0 = 2.0s (> 0.75s). Should receive full +0.70s.
    assert.strictEqual(subtitles[0].endSec, 3.7);
    assert.strictEqual(subtitles[0].end, '00:00:03,700');
    assert.ok(subtitles[0].endSec < subtitles[1].startSec, 'Row 1 must not overlap Row 2');

    // Row 2: gap to video duration (10.0) is 3.0s. Should receive full +0.70s.
    assert.strictEqual(subtitles[1].endSec, 7.7);
    assert.strictEqual(subtitles[1].end, '00:00:07,700');
    console.log('✅ Passed Test Case 1: Wide gap receives full requested padding (+0.70s)');
  }

  // Test Case 2: Narrow gap -> clamped padding to leave 0.05s safety buffer
  {
    const subtitles = [
      { id: '1', start: '00:00:01,000', end: '00:00:03,000', startSec: 1.0, endSec: 3.0 },
      { id: '2', start: '00:00:03,300', end: '00:00:05,000', startSec: 3.3, endSec: 5.0 },
    ];

    // Available gap = 3.3 - 3.0 = 0.30s.
    // With 0.05s safety buffer, max allowed padding is 0.30 - 0.05 = 0.25s.
    // Even though requested padding is 0.70s, it must clamp to +0.25s!
    applySmartEndPadding(subtitles, 0.70, 10.0);

    assert.strictEqual(subtitles[0].endSec, 3.25);
    assert.strictEqual(subtitles[0].end, '00:00:03,250');
    assert.ok(subtitles[0].endSec <= subtitles[1].startSec - 0.05, 'Must keep at least 0.05s buffer before next row');
    console.log('✅ Passed Test Case 2: Narrow gap clamped to avoid overlap (0.05s safety buffer preserved)');
  }

  // Test Case 3: Zero or very tiny gap (<= 0.05s) -> no padding added
  {
    const subtitles = [
      { id: '1', start: '00:00:01,000', end: '00:00:03,000', startSec: 1.0, endSec: 3.0 },
      { id: '2', start: '00:00:03,030', end: '00:00:05,000', startSec: 3.03, endSec: 5.0 },
    ];

    // Gap is only 0.03s <= 0.05s safety buffer.
    applySmartEndPadding(subtitles, 0.70, 10.0);

    assert.strictEqual(subtitles[0].endSec, 3.0);
    assert.strictEqual(subtitles[0].end, '00:00:03,000');
    assert.ok(subtitles[0].endSec <= subtitles[1].startSec, 'Zero/tiny gap must never overlap');
    console.log('✅ Passed Test Case 3: Tiny gap (<=0.05s) receives 0 padding to prevent overlap');
  }

  // Test Case 4: Pre-existing raw overlap from noisy audio detection -> fixed and clamped
  {
    const subtitles = [
      { id: '1', start: '00:00:01,000', end: '00:00:03,200', startSec: 1.0, endSec: 3.2 },
      { id: '2', start: '00:00:03,100', end: '00:00:05,000', startSec: 3.1, endSec: 5.0 },
    ];

    // Row 1 ends at 3.2 but Row 2 starts at 3.1 (overlap of 0.1s in raw input)
    applySmartEndPadding(subtitles, 0.70, 10.0);

    assert.strictEqual(subtitles[0].endSec, 3.05); // 3.1 - 0.05 = 3.05s
    assert.strictEqual(subtitles[0].end, '00:00:03,050');
    assert.ok(subtitles[0].endSec <= subtitles[1].startSec - 0.05, 'Pre-existing overlap resolved safely');
    console.log('✅ Passed Test Case 4: Pre-existing raw overlap safely resolved');
  }

  // Test Case 5: Multi-row real Whisper scenario with varied gaps
  {
    const subtitles = [
      { id: '1', start: '00:00:00,500', end: '00:00:02,000', startSec: 0.5, endSec: 2.0 }, // gap to #2 is 2.5s (wide)
      { id: '2', start: '00:00:04,500', end: '00:00:06,000', startSec: 4.5, endSec: 6.0 }, // gap to #3 is 0.4s (moderate)
      { id: '3', start: '00:00:06,400', end: '00:00:08,000', startSec: 6.4, endSec: 8.0 }, // gap to #4 is 0.05s (zero room)
      { id: '4', start: '00:00:08,050', end: '00:00:09,200', startSec: 8.05, endSec: 9.2 }, // last row, video is 10.0s
    ];

    applySmartEndPadding(subtitles, 0.70, 10.0);

    // #1: 2.0 + 0.70 = 2.700
    assert.strictEqual(subtitles[0].endSec, 2.7);
    assert.strictEqual(subtitles[0].end, '00:00:02,700');

    // #2: gap is 0.4s -> max padding is 0.4 - 0.05 = 0.35s -> 6.0 + 0.35 = 6.350
    assert.strictEqual(subtitles[1].endSec, 6.35);
    assert.strictEqual(subtitles[1].end, '00:00:06,350');

    // #3: gap is 0.05s -> no padding -> stays 8.000
    assert.strictEqual(subtitles[2].endSec, 8.0);
    assert.strictEqual(subtitles[2].end, '00:00:08,000');

    // #4: gap to video duration (10.0) is 0.8s -> gets full 0.70s -> 9.2 + 0.7 = 9.900
    assert.strictEqual(subtitles[3].endSec, 9.9);
    assert.strictEqual(subtitles[3].end, '00:00:09,900');

    // Verify invariant: across all rows, no row overlaps next row
    for (let i = 0; i < subtitles.length - 1; i++) {
      assert.ok(
        subtitles[i].endSec <= subtitles[i + 1].startSec,
        `Row ${i} endSec (${subtitles[i].endSec}) must be <= Row ${i+1} startSec (${subtitles[i+1].startSec})`
      );
    }

    console.log('✅ Passed Test Case 5: Multi-row Whisper scenario strictly preserves non-overlapping invariant');
  }

  // Test Case 6: Subtitles without startSec/endSec properties (derives from string)
  {
    const subtitles = [
      { id: '1', start: '00:00:01,000', end: '00:00:02,000' },
      { id: '2', start: '00:00:03,000', end: '00:00:04,000' }
    ];

    applySmartEndPadding(subtitles, 0.50);

    assert.strictEqual(subtitles[0].endSec, 2.5);
    assert.strictEqual(subtitles[0].end, '00:00:02,500');
    console.log('✅ Passed Test Case 6: Automatically parses and sets startSec & endSec from SRT strings');
  }

  console.log('\n🎉 ALL SMART NON-OVERLAPPING END PADDING TESTS PASSED SUCCESSFULLY! (6/6)');
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
