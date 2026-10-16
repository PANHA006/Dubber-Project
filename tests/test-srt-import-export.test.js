/**
 * Test: SRT Import & Export
 *
 * REWRITTEN — the previous version of this file defined its own local copies of
 * `generateSRTString()` and `parseSRT()` and asserted against those. It could
 * therefore pass while the real implementation in public/js/subtitles.js was
 * broken. This version imports the real exported functions and tests them.
 *
 * The contract under test is the translation round-trip:
 *   EXPORT -> the ORIGINAL speech is written to a file named Subtitle.srt
 *   IMPORT -> the file's text becomes the KHMER line
 *   JOIN   -> blocks are matched onto table rows by START TIMECODE, because
 *             `applySmartEndPadding()` mutates every endSec and makes it
 *             unusable as an identity
 *
 * Run: node tests/test-srt-import-export.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const subtitles = require('../public/js/subtitles.js');
const {
  buildSRTString,
  pickSrtExportText,
  parseSRTContent,
  joinImportedSRT,
  JOIN_TOLERANCE_SEC,
  formatTimecodeSRT,
  parseTimecodeSRT
} = subtitles;

const SUBTITLES_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'subtitles.js'), 'utf8');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

console.log('================================================================');
console.log('   🧪 SRT IMPORT & EXPORT VERIFICATION TEST');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// 1. HTML wiring
// ---------------------------------------------------------------------------
console.log('--- 1. VERIFYING HTML ELEMENTS IN public/index.html ---');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

check('toolbar exposes both SRT buttons and the file input', () => {
  assert(indexHtml.includes('triggerSRTUpload()'), 'index.html must have triggerSRTUpload()');
  assert(indexHtml.includes('exportSRTFile()'), 'index.html must have exportSRTFile()');
  assert(indexHtml.includes('id="srt-file-input"'), 'index.html must have #srt-file-input');
  assert(indexHtml.includes('Import SRT'), 'Button label must show "Import SRT"');
  assert(indexHtml.includes('Export SRT'), 'Button label must show "Export SRT"');
});

// ---------------------------------------------------------------------------
// 2. Timecode helpers
// ---------------------------------------------------------------------------
console.log('\n--- 2. VERIFYING SRT TIMECODE HELPERS ---');

check('formatTimecodeSRT pads to HH:MM:SS,mmm', () => {
  assert.strictEqual(formatTimecodeSRT(0), '00:00:00,000');
  assert.strictEqual(formatTimecodeSRT(65.432), '00:01:05,432');
});

check('parseTimecodeSRT reads HH:MM:SS,mmm back to seconds', () => {
  assert.strictEqual(parseTimecodeSRT('00:01:05,432'), 65.432);
});

// ---------------------------------------------------------------------------
// 3. EXPORT contract — original speech, fixed file name
// ---------------------------------------------------------------------------
console.log('\n--- 3. VERIFYING SRT EXPORT CONTRACT ---');

const project = [
  {
    id: 'sub-1',
    start: '00:00:00,000',
    end: '00:00:03,960',
    startSec: 0.0,
    endSec: 3.960,
    originalText: '我和许艳相恋三年',
    englishText: 'I dated Xu Yan for three years.',
    khmerText: '',
    voice: 'Sreymom (Female)'
  },
  {
    id: 'sub-2',
    start: '00:00:03,960',
    end: '00:00:05,650',
    startSec: 3.960,
    endSec: 5.650,
    originalText: '而我憧憬的幸福',
    englishText: 'And the happiness I longed for.',
    khmerText: '',
    voice: 'Piseth (Male)'
  },
  {
    id: 'sub-3',
    start: '00:00:05,700',
    end: '00:00:08,450',
    startSec: 5.700,
    endSec: 8.450,
    originalText: '却被现实的世俗狠狠上了一课',
    englishText: 'Was taught a hard lesson by reality.',
    khmerText: '',
    voice: 'Piseth (Male)'
  }
];

const exportedSRT = buildSRTString(project);

check('exports the ORIGINAL speech, not the translation', () => {
  assert(exportedSRT.includes('我和许艳相恋三年'));
  assert(exportedSRT.includes('却被现实的世俗狠狠上了一课'));
  assert(!exportedSRT.includes('I dated Xu Yan'), 'the English pivot must NOT be exported');
});

check('falls back to Khmer only when a row has no original text', () => {
  assert.strictEqual(pickSrtExportText({ originalText: 'ចិន', khmerText: 'ខ្មែរ' }), 'ចិន');
  assert.strictEqual(pickSrtExportText({ originalText: '', khmerText: 'ខ្មែរ' }), 'ខ្មែរ');
  assert.strictEqual(pickSrtExportText({ originalText: '   ', khmerText: 'ខ្មែរ' }), 'ខ្មែរ');
  assert.strictEqual(pickSrtExportText({}), '');
});

check('emits valid SubRip numbering and timecodes', () => {
  assert(exportedSRT.includes('1\r\n00:00:00,000 --> 00:00:03,960\r\n我和许艳相恋三年'));
  assert(exportedSRT.includes('2\r\n00:00:03,960 --> 00:00:05,650\r\n而我憧憬的幸福'));
});

check('returns an empty string for an empty list', () => {
  assert.strictEqual(buildSRTString([]), '');
  assert.strictEqual(buildSRTString(null), '');
});

check('the export file is always named Subtitle.srt', () => {
  assert(SUBTITLES_SRC.includes("const downloadName = filename || 'Subtitle.srt'"),
    'exportSRTFile must default the download name to Subtitle.srt');
  const exportFn = SUBTITLES_SRC.slice(
    SUBTITLES_SRC.indexOf('export function exportSRTFile'),
    SUBTITLES_SRC.indexOf('export function triggerSRTUpload')
  );
  assert(!exportFn.includes('state.videoName'),
    'the export must no longer derive its name from the loaded video');
  assert(!exportFn.includes('subtitles.srt'),
    'the old lowercase subtitles.srt default should be gone');
});

// ---------------------------------------------------------------------------
// 4. IMPORT contract — the file's text becomes the Khmer line
// ---------------------------------------------------------------------------
console.log('\n--- 4. VERIFYING SRT IMPORT CONTRACT (khmer text) ---');

const parsedRoundTrip = parseSRTContent(exportedSRT);

check('parses every block with correct timings', () => {
  assert.strictEqual(parsedRoundTrip.length, 3);
  assert.strictEqual(parsedRoundTrip[0].start, '00:00:00,000');
  assert.strictEqual(parsedRoundTrip[0].end, '00:00:03,960');
  assert.strictEqual(parsedRoundTrip[0].startSec, 0.0);
  assert.strictEqual(parsedRoundTrip[2].startSec, 5.7);
});

check('puts the file text into khmerText, not originalText', () => {
  assert.strictEqual(parsedRoundTrip[0].khmerText, '我和许艳相恋三年');
  assert.strictEqual(parsedRoundTrip[0].originalText, '');
  assert.strictEqual(parsedRoundTrip[0].englishText, '');
});

check('no longer applies the old Khmer-script detection heuristic', () => {
  assert(!SUBTITLES_SRC.includes('const isKhmer = /[\\u1780-\\u17FF]/'),
    'the dead isKhmer detection should have been removed');
  const latin = parseSRTContent('1\n00:00:01,000 --> 00:00:02,000\nHello world\n');
  assert.strictEqual(latin[0].khmerText, 'Hello world');
  assert.strictEqual(latin[0].originalText, '');
});

check('tolerates dot timecodes and normalises them to commas', () => {
  const dotSRT = '1\n00:00:01.500 --> 00:00:04.250\nHello world from SRT with dots\n\n2\n00:00:05.000 --> 00:00:08.000\nជំរាបសួរពីប្រទេសកម្ពុជា\n';
  const parsedDot = parseSRTContent(dotSRT);
  assert.strictEqual(parsedDot.length, 2);
  assert.strictEqual(parsedDot[0].startSec, 1.5);
  assert.strictEqual(parsedDot[0].start, '00:00:01,500');
  assert.strictEqual(parsedDot[1].khmerText, 'ជំរាបសួរពីប្រទេសកម្ពុជា');
});

check('returns an empty array for malformed or empty input', () => {
  assert.deepStrictEqual(parseSRTContent(''), []);
  assert.deepStrictEqual(parseSRTContent(null), []);
  assert.deepStrictEqual(parseSRTContent('no timecodes here at all'), []);
});

// ---------------------------------------------------------------------------
// 5. JOIN BY TIMECODE
// ---------------------------------------------------------------------------
console.log('\n--- 5. VERIFYING THE TIMECODE JOIN ---');

// The real-world case: the incoming file carries UNPADDED end times while the
// project's ends were extended by applySmartEndPadding(). Only startSec agrees,
// which is exactly why the join keys on startSec.
const incomingSRT =
  '1\r\n00:00:00,000 --> 00:00:03,910\r\nខ្ញុំស្រលាញ់នាងបីឆ្នាំ\r\n\r\n' +
  '2\r\n00:00:03,960 --> 00:00:05,650\r\nសុភមង្គលដែលខ្ញុំស្រមៃ\r\n\r\n' +
  '3\r\n00:00:05,700 --> 00:00:08,450\r\nត្រូវជីវិតបង្រៀនមេរៀនធំ\r\n\r\n';

const incoming = parseSRTContent(incomingSRT);

check('JOIN_TOLERANCE_SEC is exported and stays tight', () => {
  assert.strictEqual(typeof JOIN_TOLERANCE_SEC, 'number');
  assert(JOIN_TOLERANCE_SEC > 0 && JOIN_TOLERANCE_SEC <= 0.5,
    'a wide tolerance would start pairing different lines');
});

check('matches every block by START timecode despite differing end times', () => {
  const r = joinImportedSRT(incoming, project);
  assert.strictEqual(r.matched, 3);
  assert.strictEqual(r.byTimecode, 3, 'all three should match on timecode');
  assert.strictEqual(r.byInterpolation, 0, 'no interpolation should be needed');
  assert.strictEqual(r.byPosition, 0, 'no positional fallback should be needed');
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows.length, 3);
  assert.strictEqual(r.rows[0].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
  assert.strictEqual(r.rows[2].khmerText, 'ត្រូវជីវិតបង្រៀនមេរៀនធំ');
});

check('a matched row keeps its original, English, voice, id and padded timing', () => {
  const r = joinImportedSRT(incoming, project);
  assert.strictEqual(r.rows[0].originalText, '我和许艳相恋三年');
  assert.strictEqual(r.rows[0].englishText, 'I dated Xu Yan for three years.');
  assert.strictEqual(r.rows[0].voice, 'Sreymom (Female)');
  assert.strictEqual(r.rows[0].id, 'sub-1');
  assert.strictEqual(r.rows[0].endSec, 3.960, 'the file must not overwrite the project timing');
  assert.strictEqual(r.rows[1].voice, 'Piseth (Male)');
});

check('the incoming array and the project array are never mutated', () => {
  const before = JSON.stringify(project);
  const incomingBefore = JSON.stringify(incoming);
  joinImportedSRT(incoming, project);
  assert.strictEqual(JSON.stringify(project), before, 'project must not be mutated');
  assert.strictEqual(JSON.stringify(incoming), incomingBefore, 'incoming must not be mutated');
});

check('joins correctly even when the table order is reversed', () => {
  const reversed = [project[2], project[1], project[0]];
  const r = joinImportedSRT(incoming, reversed);
  assert.strictEqual(r.matched, 3);
  // Row 1 of the table is now the 5.700s line, so it takes block 3's text.
  assert.strictEqual(r.rows[0].originalText, '却被现实的世俗狠狠上了一课');
  assert.strictEqual(r.rows[0].khmerText, 'ត្រូវជីវិតបង្រៀនមេរៀនធំ');
  assert.strictEqual(r.rows[2].originalText, '我和许艳相恋三年');
  assert.strictEqual(r.rows[2].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
});

check('absorbs small jitter within the tolerance', () => {
  const jittered = '1\n00:00:00,080 --> 00:00:03,910\nខ្ញុំស្រលាញ់នាងបីឆ្នាំ\n';
  const r = joinImportedSRT(parseSRTContent(jittered), project);
  assert.strictEqual(r.matched, 1);
  assert.strictEqual(r.rows[0].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
});

check('does NOT pair a line that sits outside the tolerance', () => {
  const far = '1\n00:00:30,000 --> 00:00:32,000\nខ្ញុំស្រលាញ់នាងបីឆ្នាំ\n';
  const r = joinImportedSRT(parseSRTContent(far), project);
  assert.strictEqual(r.matched, 0);
  assert.strictEqual(r.appended, 1, 'an unmatched block becomes a new row');
  assert.strictEqual(r.unmatchedExisting, 3, 'the three project rows stay untouched');
  assert.strictEqual(r.rows[3].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
  assert.strictEqual(r.rows[3].originalText, '');
});

check('appends blocks that cannot be placed, and never deletes a row', () => {
  // Three blocks against TWO rows: the extra block has no anchor to lean on and
  // the sizes disagree, so it must be appended rather than steal a real row.
  const twoRows = [project[0], project[1]];
  const mixed = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:03,960', 'K2'],
    ['00:01:00,000', 'K_NEW']
  ]);
  const r = joinImportedSRT(parseSRTContent(mixed), twoRows);
  assert.strictEqual(r.byTimecode, 2);
  assert.strictEqual(r.byInterpolation, 0);
  assert.strictEqual(r.appended, 1, 'the unplaceable block becomes a new row');
  assert.strictEqual(r.rows.length, 3, 'two original rows plus one appended');
  assert.strictEqual(r.rows[0].originalText, '我和许艳相恋三年');
  assert.strictEqual(r.rows[0].khmerText, 'K1');
  assert.strictEqual(r.rows[1].khmerText, 'K2');
  assert.strictEqual(r.rows[2].khmerText, 'K_NEW');
  assert.strictEqual(r.rows[2].originalText, '');
});

check('a far block DOES land positionally when the sizes agree 1:1', () => {
  // Equal counts and blocks 1-2 aligned exactly, so block 3 is the table's row 3
  // even though its own timestamp was edited to something nonsensical.
  const shifted = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:03,960', 'K2'],
    ['00:01:00,000', 'K3']
  ]);
  const r = joinImportedSRT(parseSRTContent(shifted), project);
  assert.strictEqual(r.byTimecode, 2);
  assert.strictEqual(r.byInterpolation, 1);
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[2].originalText, '却被现实的世俗狠狠上了一课');
  assert.strictEqual(r.rows[2].khmerText, 'K3');
});

check('uses the positional fallback only on an equal row count', () => {
  // Same count, but every timestamp is far away -> nothing matches by time,
  // so the file's block numbers map onto the table rows.
  const farButEqual =
    '1\r\n00:01:00,000 --> 00:01:01,000\r\nA\r\n\r\n' +
    '2\r\n00:02:00,000 --> 00:02:01,000\r\nB\r\n\r\n' +
    '3\r\n00:03:00,000 --> 00:03:01,000\r\nC\r\n\r\n';
  const r = joinImportedSRT(parseSRTContent(farButEqual), project);
  assert.strictEqual(r.byPosition, 3);
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[0].khmerText, 'A');
  assert.strictEqual(r.rows[2].khmerText, 'C');
  assert.strictEqual(r.rows[0].originalText, '我和许艳相恋三年', 'the original is still preserved');
});

check('handles an empty table and an empty file', () => {
  const intoEmpty = joinImportedSRT(incoming, []);
  assert.strictEqual(intoEmpty.appended, 3);
  assert.strictEqual(intoEmpty.rows.length, 3);
  assert.strictEqual(intoEmpty.matched, 0);

  const noBlocks = joinImportedSRT([], project);
  assert.strictEqual(noBlocks.matched, 0);
  assert.strictEqual(noBlocks.rows.length, 3, 'the project survives an empty import');
  assert.strictEqual(noBlocks.unmatchedExisting, 3);

  const nothing = joinImportedSRT([], []);
  assert.deepStrictEqual(nothing.rows, []);
});

check('importSRTContent delegates to parse + join', () => {
  assert(SUBTITLES_SRC.includes('const parsed = parseSRTContent(content)'));
  assert(SUBTITLES_SRC.includes('joinImportedSRT(parsed, state.subtitles)'));
  assert(!SUBTITLES_SRC.includes('mergeImportedSRT'), 'the positional merge should be gone');
  assert(SUBTITLES_SRC.includes("state.emit('subtitlesChanged', state.subtitles)"),
    'importSRTContent must still emit subtitlesChanged so autosave fires');
});

// ---------------------------------------------------------------------------
// 5b. INTERPOLATION — ID right but the timecode is broken
// ---------------------------------------------------------------------------
console.log('\n--- 5b. VERIFYING INTERPOLATION BETWEEN ANCHORS ---');

/** Build an SRT body from [startTime, text] pairs. */
function srtFrom(pairs) {
  return pairs.map(([t, text], i) => `${i + 1}\r\n${t} --> ${t}\r\n${text}\r\n`).join('\r\n') + '\r\n';
}

check('rescues a block whose OWN timecode is broken', () => {
  // Blocks 1 and 3 match on timecode; block 2's timestamp was edited.
  // Before interpolation this appended a duplicate row and left row 2 empty.
  const broken = srtFrom([
    ['00:00:00,000', 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ'],
    ['00:00:44,000', 'សុភមង្គលដែលខ្ញុំស្រមៃ'],
    ['00:00:05,700', 'ត្រូវជីវិតបង្រៀនមេរៀនធំ']
  ]);
  const r = joinImportedSRT(parseSRTContent(broken), project);
  assert.strictEqual(r.byTimecode, 2);
  assert.strictEqual(r.byInterpolation, 1, 'the broken block should be interpolated');
  assert.strictEqual(r.appended, 0, 'no duplicate row should be created');
  assert.strictEqual(r.rows.length, 3, 'the table must not grow');
  assert.strictEqual(r.rows[1].originalText, '而我憧憬的幸福');
  assert.strictEqual(r.rows[1].khmerText, 'សុភមង្គលដែលខ្ញុំស្រមៃ', 'row 2 must now have its Khmer');
});

check('rescues a broken FIRST block using the next anchor', () => {
  const broken = srtFrom([
    ['00:00:55,000', 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ'],
    ['00:00:03,960', 'សុភមង្គលដែលខ្ញុំស្រមៃ'],
    ['00:00:05,700', 'ត្រូវជីវិតបង្រៀនមេរៀនធំ']
  ]);
  const r = joinImportedSRT(parseSRTContent(broken), project);
  assert.strictEqual(r.byInterpolation, 1);
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[0].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
});

check('rescues a broken LAST block using the previous anchor', () => {
  const broken = srtFrom([
    ['00:00:00,000', 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ'],
    ['00:00:03,960', 'សុភមង្គលដែលខ្ញុំស្រមៃ'],
    ['00:00:55,000', 'ត្រូវជីវិតបង្រៀនមេរៀនធំ']
  ]);
  const r = joinImportedSRT(parseSRTContent(broken), project);
  assert.strictEqual(r.byInterpolation, 1);
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[2].khmerText, 'ត្រូវជីវិតបង្រៀនមេរៀនធំ');
});

check('a genuinely INSERTED line is appended, never interpolated over a row', () => {
  // 4 blocks for 3 rows. The anchors (block1->row1, block3->row2, block4->row3)
  // disagree on the spacing, so block 2 must NOT steal a row.
  const inserted = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:02,000', 'K_NEW'],
    ['00:00:03,960', 'K2'],
    ['00:00:05,700', 'K3']
  ]);
  const r = joinImportedSRT(parseSRTContent(inserted), project);
  assert.strictEqual(r.byTimecode, 3);
  assert.strictEqual(r.byInterpolation, 0, 'inconsistent spacing must block interpolation');
  assert.strictEqual(r.appended, 1);
  assert.strictEqual(r.rows.length, 4);
  assert.strictEqual(r.rows[0].originalText, '我和许艳相恋三年');
  assert.strictEqual(r.rows[0].khmerText, 'K1');
  assert.strictEqual(r.rows[1].khmerText, 'K2', 'row 2 keeps the line that belongs to it');
  assert.strictEqual(r.rows[3].khmerText, 'K_NEW');
  assert.strictEqual(r.rows[3].originalText, '');
});

check('a DELETED line makes the anchors disagree too, so nothing is absorbed', () => {
  // 2 blocks for 3 rows; block 2 matches row 3, leaving row 2 with no anchor
  // on the far side of a gap the spans cannot justify.
  const deleted = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:05,700', 'K3']
  ]);
  const r = joinImportedSRT(parseSRTContent(deleted), project);
  assert.strictEqual(r.byTimecode, 2);
  assert.strictEqual(r.byInterpolation, 0, 'a 1:2 span is not a 1:1 mapping');
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[0].khmerText, 'K1');
  assert.strictEqual(r.rows[2].khmerText, 'K3');
  assert.strictEqual(r.rows[1].khmerText, '', 'row 2 is correctly left alone');
});

check('interpolates a run of consecutive broken blocks without cascading', () => {
  // Only block 1 matches on time. Blocks 2 and 3 are both broken; each is
  // placed by counting from the ONE original anchor, not from each other, so a
  // bad guess can never compound.
  const broken = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:44,000', 'K2'],
    ['00:00:46,000', 'K3']
  ]);
  const r = joinImportedSRT(parseSRTContent(broken), project);
  assert.strictEqual(r.byTimecode, 1, 'only block 1 matches on time');
  assert.strictEqual(r.byInterpolation, 2, 'both broken blocks are placed by offset');
  assert.strictEqual(r.appended, 0);
  assert.strictEqual(r.rows[0].khmerText, 'K1');
  assert.strictEqual(r.rows[1].khmerText, 'K2');
  assert.strictEqual(r.rows[2].khmerText, 'K3');
});

check('never pairs an interpolated row onto an already-taken row', () => {
  const broken = srtFrom([
    ['00:00:00,000', 'K1'],
    ['00:00:44,000', 'K2'],
    ['00:00:05,700', 'K3']
  ]);
  const r = joinImportedSRT(parseSRTContent(broken), project);
  // Row 3 is claimed by block 3 via timecode, so block 2 cannot land on it.
  const khmerSet = r.rows.map(x => x.khmerText);
  assert.strictEqual(khmerSet[0], 'K1');
  assert.strictEqual(khmerSet[2], 'K3');
  assert.strictEqual(khmerSet[1], 'K2');
  assert.strictEqual(new Set(khmerSet).size, 3, 'each row must hold a distinct line');
});

// ---------------------------------------------------------------------------
// 6. Full round-trip
// ---------------------------------------------------------------------------
console.log('\n--- 6. VERIFYING THE FULL TRANSLATION ROUND-TRIP ---');

check('export original -> translate -> import gives ORIGINAL | KHMER', () => {
  // 1. Export the project's original speech.
  const out = buildSRTString(project);
  assert(out.includes('我和许艳相恋三年'));
  assert(!out.includes('ខ្ញុំស្រលាញ់'));

  // 2. The user replaces each line with Khmer outside the app.
  const back = parseSRTContent(incomingSRT);

  // 3. Import joins it back onto the table by timecode.
  const { rows, matched, appended } = joinImportedSRT(back, project);
  assert.strictEqual(matched, 3);
  assert.strictEqual(appended, 0);

  // 4. Every row is a complete ORIGINAL | KHMER pair, in the project's order.
  rows.forEach((row, i) => {
    assert.strictEqual(row.originalText, project[i].originalText, `row ${i + 1} original mismatch`);
    assert(row.khmerText, `row ${i + 1} has no Khmer text`);
  });
  assert.strictEqual(rows[0].khmerText, 'ខ្ញុំស្រលាញ់នាងបីឆ្នាំ');
  assert.strictEqual(rows[2].khmerText, 'ត្រូវជីវិតបង្រៀនមេរៀនធំ');
});

check('re-importing an unchanged export is idempotent', () => {
  const once = joinImportedSRT(parseSRTContent(buildSRTString(project)), project);
  const twice = joinImportedSRT(parseSRTContent(buildSRTString(project)), once.rows);
  assert.strictEqual(twice.matched, 3);
  assert.strictEqual(twice.appended, 0);
  assert.strictEqual(twice.rows.length, 3);
});

console.log(`\n================================================================`);
console.log(`   🎉 ALL ${passed} SRT IMPORT & EXPORT ASSERTIONS PASSED!`);
console.log(`================================================================\n`);
