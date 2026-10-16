/**
 * Test: Translation Prompt Library
 *
 * Guards the prompt contract between src/prompts/translation-prompts.js and
 * src/services/gemini.service.js. These assertions are deliberately textual:
 * a prompt is a product surface, and regressions in its wording are what break
 * the 2-step pipeline in production.
 *
 * Run: node tests/translation-prompts.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { buildStep1Prompt, buildStep2Prompt, buildZhToKmPrompt } = require('../src/prompts/translation-prompts');

const SERVICES_PATH = path.join(__dirname, '..', 'src', 'services', 'gemini.service.js');
const serviceSrc = fs.readFileSync(SERVICES_PATH, 'utf8');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

console.log('\n🧪 Translation Prompt Library Test\n');

// ---------------------------------------------------------------------------
// STEP 1 — Chinese/English -> English
// ---------------------------------------------------------------------------
console.log('📝 STEP 1 prompt (Chinese/English -> English)');

const step1 = buildStep1Prompt('1. 你看看你\n2. 只占一个字：狗！');

check('has the elite translator role header', () => {
  assert(step1.includes('You are an elite Chinese-English audiovisual localization master'));
});

check('declares itself STEP 1 of a 2-step pipeline', () => {
  assert(step1.includes('STEP 1 of a 2-step dubbing pipeline'));
});

check('covers ASR homophone disambiguation', () => {
  assert(step1.includes('CONTEXTUAL ASR HOMOPHONE DISAMBIGUATION'));
  assert(step1.includes('占 vs 站'));
});

check('covers cultural memes and slang decoding', () => {
  assert(step1.includes('DECODE CULTURAL MEMES, SLANG & BANTER'));
  assert(step1.includes('小奶狗'), 'must keep the 小奶狗 worked example');
  assert(step1.includes('Preserve comedic punchlines'));
});

check('demands conversational spoken English', () => {
  assert(step1.includes('CONVERSATIONAL SPOKEN ENGLISH'));
});

check('defers proper-noun transliteration to Step 2', () => {
  assert(step1.includes('PROPER NOUNS & NUMBERS'));
  assert(step1.includes('will be transliterated into Khmer in Step 2'));
});

check('enforces one output line per input line', () => {
  assert(step1.includes('One input line = one output line'));
});

check('mandates strict JSON with englishText key', () => {
  assert(step1.includes('OUTPUT FORMAT (STRICT JSON ONLY)'));
  assert(step1.includes('"englishText"'));
});

check('forbids markdown code fences', () => {
  assert(step1.includes('Never wrap the JSON in markdown code fences'));
});

check('appends the injected input lines verbatim', () => {
  assert(step1.includes('Lines to translate:'));
  assert(step1.includes('1. 你看看你'));
  assert(step1.includes('2. 只占一个字：狗！'));
});

// ---------------------------------------------------------------------------
// STEP 2 — English -> Spoken Cinema Khmer
// ---------------------------------------------------------------------------
console.log('\n📝 STEP 2 prompt (English -> Spoken Cinema Khmer)');

const step2 = buildStep2Prompt('1. [Duration: 2.7s, Max Words: ~9] Are you tired of living?!');

check('has the dubbing-director role header', () => {
  assert(step2.includes('You are an elite Cambodian movie dubbing director'));
});

check('declares itself STEP 2 of a 2-step pipeline', () => {
  assert(step2.includes('STEP 2 of a 2-step dubbing pipeline'));
});

check('bans textbook / dictionary Khmer', () => {
  assert(step2.includes('STRICTLY BAN textbook'));
  assert(step2.includes('ហាមដាច់ខាតភាសាសៀវភៅ'));
});

check('bans the repetition symbol ៗ and requires doubled words', () => {
  assert(step2.includes('ABSOLUTE PROHIBITION ON THE REPETITION SYMBOL "ៗ"'));
  assert(step2.includes('write the word twice in full') || step2.includes('WRITE THE WORD TWICE IN FULL'));
  assert(step2.includes('បាទៗ → បាទបាទ'), 'must map បាទៗ -> បាទបាទ');
  assert(step2.includes('អើៗ → អើអើ'), 'must map អើៗ -> អើអើ');
  assert(step2.includes('ត្រូវហើយៗ → ត្រូវហើយត្រូវហើយ'), 'must map ត្រូវហើយៗ');
  assert(step2.includes('លឿនៗ → លឿនលឿន'), 'must map លឿនៗ -> លឿនលឿន');
});

check('keeps the ចាស់ anti-hallucination guard (without the ៗ symbol)', () => {
  assert(step2.includes('ABSOLUTE PROHIBITION ON "ចាស់" FOR AFFIRMATION'));
  assert(step2.includes('«បាទបាទ»'), 'must allow បាទបាទ');
  assert(step2.includes('«អើអើ»'), 'must allow អើអើ');
  assert(step2.includes('«ត្រូវហើយត្រូវហើយ»'), 'must allow ត្រូវហើយត្រូវហើយ');
  assert(step2.includes('«ចាសចាស»'), 'must allow ចាសចាស (no final ស)');
  assert(step2.includes('means "old / elderly"'), 'must explain why ចាស់ is banned');
});

check('the worked JSON examples contain no ៗ glyph', () => {
  const jsonBlock = step2.slice(step2.indexOf('Example output format:'));
  assert(!jsonBlock.includes('ៗ'), 'the example output must not itself use ៗ');
  assert(jsonBlock.includes('គម្រោងឆ្កួតឆ្កួត'), 'example must use the doubled form');
  assert(jsonBlock.includes('ត្រូវហើយត្រូវហើយ'), 'example must use the doubled form');
});

check('carries the Edge-TTS phonetic respelling rules', () => {
  assert(step2.includes('PHONETIC SPELLING FOR EDGE-TTS'));
  assert(step2.includes('ចេតណា'), 'must keep the ន -> ណ respelling example');
  assert(step2.includes('ខ្សែរក'), 'must keep the ខ្សែក -> ខ្សែរក respelling example');
});

check('maps rhetorical anger to the approved phrase', () => {
  assert(step2.includes('RHETORICAL ANGER & CONFRONTATION'));
  assert(step2.includes('«ឯងចង់ងាប់ហើយមែនទេ?!»'));
  assert(step2.includes('NEVER output broken, awkward particles like «ហំ?»'));
});

check('repeats the three-tier time budget', () => {
  assert(step2.includes('STRICT TIME BUDGET & PACING'));
  assert(step2.includes('< 1.5s'));
  assert(step2.includes('1.5s - 2.5s'));
  assert(step2.includes('> 2.5s'));
});

check('requires transparent delete of awkward padding', () => {
  assert(step2.includes('REMOVE AWKWARD PADDING & FILLERS'));
  assert(step2.includes("DO NOT output '/' in the final translation"));
});

check('translates proper nouns into Khmer', () => {
  assert(step2.includes('PROPER NOUNS → KHMER'));
  assert(step2.includes('"John" → "ចន"'));
  assert(step2.includes('"Alice" → "អាលីស"'));
  assert(step2.includes('ALWAYS transliterate Latin-script proper nouns'));
});

check('preserves currency but spells numbers as Khmer words', () => {
  assert(step2.includes('NUMBERS & CURRENCY'));
  assert(step2.includes('PRESERVE currency names'));
  assert(step2.includes('100,000 → មួយសែន'), '100,000 is មួយសែន, NOT មួយលាន');
  assert(step2.includes('1,000,000 → មួយលាន'));
  assert(step2.includes('23,000,000 → ម្ភៃបីលាន'));
  assert(step2.includes('50% → ហាសិបភាគរយ'));
});

check('mandates strict JSON with khmerText key', () => {
  assert(step2.includes('OUTPUT FORMAT (STRICT JSON ONLY)'));
  assert(step2.includes('"khmerText"'));
  assert(step2.includes('Never wrap the JSON in markdown code fences'));
});
check('appends the duration-annotated input lines verbatim', () => {
  assert(step2.includes('Lines to translate:'));
  assert(step2.includes('[Duration: 2.7s, Max Words: ~9]'));
});

// ---------------------------------------------------------------------------
// DIRECT — Chinese -> Spoken Cinema Khmer (single-call path)
// ---------------------------------------------------------------------------
console.log('\n📝 DIRECT prompt (Chinese -> Spoken Cinema Khmer, 1 call)');

const direct = buildZhToKmPrompt('1. [Duration: 2.7s, Max Words: ~9] 你是不是活腻了？！');

check('has the Chinese-Khmer localization role header', () => {
  assert(direct.includes('elite Cambodian movie dubbing director'));
  assert(direct.includes('Chinese-Khmer audiovisual localization master'));
});

check('asks for a SINGLE pass and forbids an English output', () => {
  assert(direct.includes('in ONE single pass'));
  assert(direct.includes('Do NOT produce any English'));
});

check('carries the ASR homophone repair duty from Step 1', () => {
  assert(direct.includes('CONTEXTUAL ASR HOMOPHONE DISAMBIGUATION'));
  assert(direct.includes('占 vs 站'));
});

check('carries the meme / punchline duty from Step 1', () => {
  assert(direct.includes('DECODE CULTURAL MEMES, SLANG & BANTER'));
  assert(direct.includes('Preserve comedic punchlines'));
});

check('repeats the ៗ ban with the full mapping list', () => {
  assert(direct.includes('ABSOLUTE PROHIBITION ON THE REPETITION SYMBOL "ៗ"'));
  assert(direct.includes('បាទៗ → បាទបាទ'));
  assert(direct.includes('អើៗ → អើអើ'));
  assert(direct.includes('ត្រូវហើយៗ → ត្រូវហើយត្រូវហើយ'));
  assert(direct.includes('លឿនៗ → លឿនលឿន'));
  assert(direct.includes('គម្រោងឆ្កួតៗ → គម្រោងឆ្កួតឆ្កួត'));
});

check('repeats the ចាស់ anti-hallucination guard', () => {
  assert(direct.includes('ABSOLUTE PROHIBITION ON "ចាស់" FOR AFFIRMATION'));
  assert(direct.includes('«បាទបាទ»'));
  assert(direct.includes('«ចាសចាស»'));
  assert(direct.includes('means "old / elderly"'));
});

check('repeats the three-tier time budget', () => {
  assert(direct.includes('STRICT TIME BUDGET & PACING'));
  assert(direct.includes('< 1.5s'));
  assert(direct.includes('1.5s - 2.5s'));
  assert(direct.includes('> 2.5s'));
});

check('translates proper nouns into Khmer, including Chinese names', () => {
  assert(direct.includes('PROPER NOUNS → KHMER'));
  assert(direct.includes('"Beijing" → "ប៉េកាំង"'));
  assert(direct.includes('"小明" → "សៀវមីង"'), 'Chinese proper nouns need an example too');
});

check('maps the Chinese currency words to Khmer', () => {
  assert(direct.includes('NUMBERS & CURRENCY'));
  assert(direct.includes('"元" / "人民币" → "យន់"'));
  assert(direct.includes('100,000 → មួយសែន'));
  assert(direct.includes('1,000,000 → មួយលាន'));
  assert(direct.includes('50% → ហាសិបភាគរយ'));
});

check('carries the Edge-TTS phonetic respelling rules', () => {
  assert(direct.includes('PHONETIC SPELLING FOR EDGE-TTS'));
  assert(direct.includes('ចេតណា'));
  assert(direct.includes('ខ្សែរក'));
});

check('mandates strict JSON with khmerText and no ៗ glyph', () => {
  assert(direct.includes('OUTPUT FORMAT (STRICT JSON ONLY)'));
  assert(direct.includes('"khmerText"'));
  const jsonBlock = direct.slice(direct.indexOf('Example output format:'));
  assert(!jsonBlock.includes('ៗ'), 'the direct example output must not itself use ៗ');
});

check('forbids Chinese/English leaking into khmerText', () => {
  assert(direct.includes('ONLY Khmer script'));
});

check('appends the duration-annotated Chinese input lines verbatim', () => {
  assert(direct.includes('Lines to translate:'));
  assert(direct.includes('[Duration: 2.7s, Max Words: ~9] 你是不是活腻了？！'));
});

// ---------------------------------------------------------------------------
// Wiring: the service must delegate to this library
// ---------------------------------------------------------------------------
console.log('\n🔌 Service wiring (gemini.service.js)');

check('service requires the prompt library', () => {
  assert(serviceSrc.includes("require('../prompts/translation-prompts')"));
});

check('service builds Step 1 from the library, not an inline template', () => {
  assert(serviceSrc.includes('const prompt = buildStep1Prompt(inputLines)'));
  assert(!serviceSrc.includes('You are an elite Chinese-English audiovisual localization master'),
    'inline Step 1 prompt should have been extracted to the library');
});

check('service builds Step 2 from the library, not an inline template', () => {
  assert(serviceSrc.includes('const prompt = buildStep2Prompt(inputLines)'));
  assert(!serviceSrc.includes('You are an elite Cambodian movie dubbing director'),
    'inline Step 2 prompt should have been extracted to the library');
});

check('service builds the DIRECT zh->km prompt from the library', () => {
  assert(serviceSrc.includes('buildZhToKmPrompt'));
  assert(serviceSrc.includes('const prompt = buildZhToKmPrompt(inputLines)'));
});

check('service still keeps its failover log tags', () => {
  assert(serviceSrc.includes("'TRANSLATE:STEP1_EN'"));
  assert(serviceSrc.includes("'TRANSLATE:STEP2_KM'"));
  assert(serviceSrc.includes("'TRANSLATE:DIRECT_KM'"));
});

// ---------------------------------------------------------------------------
// TTS safety net: the ៗ expansion helper
// ---------------------------------------------------------------------------
console.log('\n🔊 expandKhmerRepetition (TTS safety net)');

const { expandKhmerRepetition } = require('../src/services/gemini.service');

check('expands a monosyllable repetition', () => {
  assert.strictEqual(expandKhmerRepetition('លឿនៗ'), 'លឿនលឿន');
  assert.strictEqual(expandKhmerRepetition('បាទៗ'), 'បាទបាទ');
  assert.strictEqual(expandKhmerRepetition('អើៗ'), 'អើអើ');
  assert.strictEqual(expandKhmerRepetition('ចាស់ៗ'), 'ចាស់ចាស់');
});

check('repeats only the FINAL syllable of a multi-syllable word', () => {
  // Khmer "ៗ" repeats the last syllable, never the whole word.
  assert.strictEqual(expandKhmerRepetition('គម្រោងឆ្កួតៗ'), 'គម្រោងឆ្កួតឆ្កួត');
  assert.strictEqual(expandKhmerRepetition('ត្រូវហើយៗ'), 'ត្រូវហើយហើយ');
  assert.strictEqual(expandKhmerRepetition('ខ្ញុំខ្លាំងណាស់ៗ'), 'ខ្ញុំខ្លាំងណាស់ណាស់');
});

check('handles mid-sentence repetition without eating neighbours', () => {
  assert.strictEqual(
    expandKhmerRepetition('បាទៗ ឯងជាមេតើ'),
    'បាទបាទ ឯងជាមេតើ'
  );
  assert.strictEqual(
    expandKhmerRepetition('អើៗ ត្រូវហើយៗ'),
    'អើអើ ត្រូវហើយហើយ'
  );
});

check('tolerates a space between the word and the symbol', () => {
  assert.strictEqual(expandKhmerRepetition('លឿន ៗ ណាស់'), 'លឿនលឿន ណាស់');
});

check('is a no-op on clean text and empty input', () => {
  assert.strictEqual(expandKhmerRepetition('គ្មានអ្វីទេ'), 'គ្មានអ្វីទេ');
  assert.strictEqual(expandKhmerRepetition(''), '');
  assert.strictEqual(expandKhmerRepetition(null), null);
});

check('leaves no ៗ behind in any expansion', () => {
  const inputs = ['លឿនៗ', 'គម្រោងឆ្កួតៗ', 'បាទៗ ឯងជាមេតើ', 'សូមអរគុណៗ'];
  for (const input of inputs) {
    assert(!expandKhmerRepetition(input).includes('ៗ'), `"${input}" still contains ៗ`);
  }
});

console.log(`\n🎉 All ${passed} prompt-library assertions passed!\n`);
