/**
 * Test: Smart Language Routing
 *
 * Verifies that a Chinese source takes the DIRECT 1-call Chinese -> Khmer path
 * (no English pivot produced, no EN line shown), while an English/unknown source
 * keeps the legacy 2-step bridged path.
 *
 * Covers four layers:
 *   1. Language normalisation + mode resolution (pure helpers)
 *   2. The router's call pattern (which service methods get invoked)
 *   3. Language propagation STT services -> controller -> API response
 *   4. Frontend: the EN badge suppression rule and the sourceLanguage payload
 *
 * Run: node tests/smart-language-routing.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const gemini = require('../src/services/gemini.service');
const { normaliseSourceLanguage, resolveTranslationMode } = gemini;

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

const ORIGINAL_MODE = process.env.TRANSLATION_MODE;
function withMode(mode, fn) {
  if (mode === undefined) delete process.env.TRANSLATION_MODE;
  else process.env.TRANSLATION_MODE = mode;
  try {
    fn();
  } finally {
    if (ORIGINAL_MODE === undefined) delete process.env.TRANSLATION_MODE;
    else process.env.TRANSLATION_MODE = ORIGINAL_MODE;
  }
}

console.log('\n🧪 Smart Language Routing Test\n');

// ---------------------------------------------------------------------------
// 1. Language normalisation
// ---------------------------------------------------------------------------
console.log('🌐 normaliseSourceLanguage()');

check('maps every Chinese variant to "zh"', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans', 'zh-Hant', 'cmn', 'yue', 'Chinese', 'Mandarin', 'Cantonese']) {
    assert.strictEqual(normaliseSourceLanguage(tag), 'zh', `"${tag}" should be zh`);
  }
});

check('maps every English variant to "en"', () => {
  for (const tag of ['en', 'eng', 'English', 'en-US', 'en-GB', 'EN']) {
    assert.strictEqual(normaliseSourceLanguage(tag), 'en', `"${tag}" should be en`);
  }
});

check('treats Khmer and other languages as "other"', () => {
  assert.strictEqual(normaliseSourceLanguage('km'), 'other');
  assert.strictEqual(normaliseSourceLanguage('ko'), 'other');
  assert.strictEqual(normaliseSourceLanguage('ja'), 'other');
});

check('tolerates missing / malformed language values', () => {
  assert.strictEqual(normaliseSourceLanguage(null), 'other');
  assert.strictEqual(normaliseSourceLanguage(undefined), 'other');
  assert.strictEqual(normaliseSourceLanguage(''), 'other');
  assert.strictEqual(normaliseSourceLanguage('   '), 'other');
  assert.strictEqual(normaliseSourceLanguage(42), 'other');
  assert.strictEqual(normaliseSourceLanguage({}), 'other');
});

// ---------------------------------------------------------------------------
// 2. Mode resolution
// ---------------------------------------------------------------------------
console.log('\n🔀 resolveTranslationMode()');

withMode('auto', () => {
  check('auto: Chinese source -> direct', () => {
    const r = resolveTranslationMode('zh-CN');
    assert.strictEqual(r.mode, 'direct');
    assert.strictEqual(r.bucket, 'zh');
  });

  check('auto: English source -> bridge', () => {
    const r = resolveTranslationMode('en');
    assert.strictEqual(r.mode, 'bridge');
    assert.strictEqual(r.bucket, 'en');
  });

  check('auto: unknown source -> bridge (safe default)', () => {
    assert.strictEqual(resolveTranslationMode(null).mode, 'bridge');
    assert.strictEqual(resolveTranslationMode('ko').mode, 'bridge');
  });
});

withMode(undefined, () => {
  check('auto is the default when TRANSLATION_MODE is unset', () => {
    assert.strictEqual(resolveTranslationMode('zh').mode, 'direct');
    assert.strictEqual(resolveTranslationMode('en').mode, 'bridge');
  });
});

withMode('bridge', () => {
  check('bridge: forces the 2-step path even for Chinese', () => {
    assert.strictEqual(resolveTranslationMode('zh').mode, 'bridge');
    assert.strictEqual(resolveTranslationMode('en').mode, 'bridge');
  });
});

withMode('direct', () => {
  check('direct: forces the single-call path even for English', () => {
    assert.strictEqual(resolveTranslationMode('en').mode, 'direct');
    assert.strictEqual(resolveTranslationMode('zh').mode, 'direct');
  });
});

withMode('AUTO', () => {
  check('mode matching is case-insensitive', () => {
    assert.strictEqual(resolveTranslationMode('zh').mode, 'direct');
  });
});

withMode('bogus-mode', () => {
  check('an unrecognised mode falls back to auto behaviour', () => {
    assert.strictEqual(resolveTranslationMode('zh').mode, 'direct');
    assert.strictEqual(resolveTranslationMode('en').mode, 'bridge');
  });
});

withMode('auto', () => {
  check('every route carries a human-readable reason for the log', () => {
    assert(typeof resolveTranslationMode('zh').reason === 'string');
    assert(resolveTranslationMode('zh').reason.length > 0);
    assert(resolveTranslationMode('en').reason.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Router call pattern (which service methods actually run)
// ---------------------------------------------------------------------------
console.log('\n🚦 translateDirect() call routing');

const SUBTITLES = [
  { id: 'sub-1', start: '00:00:00,000', end: '00:00:02,700', startSec: 0, endSec: 2.7, originalText: '你是不是活腻了？！' },
  { id: 'sub-2', start: '00:00:02,700', end: '00:00:05,200', startSec: 2.7, endSec: 5.2, originalText: '别闹了' }
];

/**
 * Stub every network-touching method and record the call order, so we can assert
 * the router's decision without spending a single Gemini quota.
 */
function recordCalls() {
  const calls = [];
  const originals = {};
  const stubs = {
    translateChineseToEnglish: async (subs) => {
      calls.push('step1');
      return subs.map(s => ({ ...s, englishText: 'stub english' }));
    },
    translateEnglishToKhmer: async (subs) => {
      calls.push('step2');
      return subs.map(s => ({ ...s, khmerText: 'អត្ថបទខ្មែរ' }));
    },
    translateChineseToKhmer: async (subs) => {
      calls.push('direct');
      return subs.map(s => ({ ...s, englishText: s.originalText, khmerText: 'អត្ថបទខ្មែរ' }));
    }
  };
  for (const [name, fn] of Object.entries(stubs)) {
    originals[name] = gemini[name];
    gemini[name] = fn;
  }
  return {
    calls,
    restore() {
      for (const [name, fn] of Object.entries(originals)) gemini[name] = fn;
    }
  };
}

(async () => {
  // --- Chinese source, auto mode -> single direct call ----------------------
  {
    const rec = recordCalls();
    withMode('auto', () => {});
    process.env.TRANSLATION_MODE = 'auto';
    try {
      const out = await gemini.translateDirect(SUBTITLES.map(s => ({ ...s })), null, { sourceLanguage: 'zh-CN' });
      check('Chinese source calls ONLY the direct translator', () => {
        assert.deepStrictEqual(rec.calls, ['direct'], `calls were: ${rec.calls.join(', ')}`);
      });
      check('direct path returns Khmer for every line', () => {
        assert.strictEqual(out.length, 2);
        assert(out.every(s => s.khmerText === 'អត្ថបទខ្មែរ'));
      });
      check('direct path mirrors originalText into englishText (no EN pivot)', () => {
        assert.strictEqual(out[0].englishText, out[0].originalText);
        assert.strictEqual(out[1].englishText, out[1].originalText);
      });
    } finally {
      rec.restore();
    }
  }

  // --- English source, auto mode -> two bridged calls ------------------------
  {
    const rec = recordCalls();
    process.env.TRANSLATION_MODE = 'auto';
    try {
      await gemini.translateDirect(SUBTITLES.map(s => ({ ...s })), null, { sourceLanguage: 'en-US' });
      check('English source calls step1 then step2 (bridged)', () => {
        assert.deepStrictEqual(rec.calls, ['step1', 'step2'], `calls were: ${rec.calls.join(', ')}`);
      });
    } finally {
      rec.restore();
    }
  }

  // --- Unknown source -> bridge (never guess) -------------------------------
  {
    const rec = recordCalls();
    process.env.TRANSLATION_MODE = 'auto';
    try {
      await gemini.translateDirect(SUBTITLES.map(s => ({ ...s })), null, {});
      check('missing sourceLanguage falls back to the bridged path', () => {
        assert.deepStrictEqual(rec.calls, ['step1', 'step2']);
      });
    } finally {
      rec.restore();
    }
  }

  // --- TRANSLATION_MODE=bridge is an instant kill switch --------------------
  {
    const rec = recordCalls();
    process.env.TRANSLATION_MODE = 'bridge';
    try {
      await gemini.translateDirect(SUBTITLES.map(s => ({ ...s })), null, { sourceLanguage: 'zh' });
      check('TRANSLATION_MODE=bridge overrides a Chinese source', () => {
        assert.deepStrictEqual(rec.calls, ['step1', 'step2']);
      });
    } finally {
      rec.restore();
      process.env.TRANSLATION_MODE = ORIGINAL_MODE;
    }
  }

  // --- Explicit single-step options still win -------------------------------
  {
    const rec = recordCalls();
    try {
      await gemini.translateSubtitles(SUBTITLES.map(s => ({ ...s })), null, { onlyStep1: true });
      check('onlyStep1 bypasses the router entirely', () => {
        assert.deepStrictEqual(rec.calls, ['step1']);
      });

      rec.calls.length = 0;
      await gemini.translateSubtitles(SUBTITLES.map(s => ({ ...s })), null, { onlyStep2: true });
      check('onlyStep2 bypasses the router entirely', () => {
        assert.deepStrictEqual(rec.calls, ['step2']);
      });
    } finally {
      rec.restore();
    }
  }

  check('an empty subtitle list is returned untouched', async () => {
    const out = await gemini.translateDirect([], null, { sourceLanguage: 'zh' });
    assert.deepStrictEqual(out, []);
    const undef = await gemini.translateDirect(null, null, { sourceLanguage: 'zh' });
    assert.deepStrictEqual(undef, []);
  });

  // -------------------------------------------------------------------------
  // 4. Language propagation: STT services -> controller -> API response
  // -------------------------------------------------------------------------
  console.log('\n📡 Language propagation');

  const whisperSrc = read('src', 'services', 'whisper.service.js');
  const groqSrc = read('src', 'services', 'groq.service.js');
  const deepgramSrc = read('src', 'services', 'deepgram.service.js');
  const controllerSrc = read('src', 'controllers', 'dubber.controller.js');

  check('whisper.service returns { segments, language }', () => {
    assert(whisperSrc.includes('resolve({ segments, language })'),
      'whisper must stop discarding the detected language');
  });

  check('groq.service returns { segments, language }', () => {
    assert(groqSrc.includes('return { segments: finalSubtitles, language:'));
  });

  check('deepgram.service returns { segments, language }', () => {
    assert(deepgramSrc.includes('return { segments: finalSubtitles, language: detectedLang }'));
  });

  check('deepgram normalises the BCP-47 tag to its primary subtag', () => {
    assert(deepgramSrc.includes('detected_language'));
    assert(deepgramSrc.includes(".split(/[-_]/)[0].toLowerCase()"));
  });

  check('controller unwraps BOTH the new object shape and the legacy array', () => {
    const unwraps = controllerSrc.match(/Array\.isArray\(\w+Result\) \? \w+Result : \(\w+Result\.segments \|\| \[\]\)/g) || [];
    assert.strictEqual(unwraps.length, 3, `expected 3 defensive unwraps (groq/deepgram/whisper), found ${unwraps.length}`);
  });

  check('controller captures the detected language from every engine', () => {
    const captures = controllerSrc.match(/detectedLanguage = Array\.isArray\(\w+Result\) \? null : \(\w+Result\.language \|\| null\)/g) || [];
    assert.strictEqual(captures.length, 3, `expected 3 language captures, found ${captures.length}`);
  });

  check('the /api/transcribe response exposes language', () => {
    assert(/res\.status\(200\)\.json\(\{\s*success: true,\s*data: subtitles,\s*language: detectedLanguage,?\s*\}\)/.test(controllerSrc),
      'the response payload must include the top-level language field');
  });

  check('the /api/translate handler forwards sourceLanguage', () => {
    assert(controllerSrc.includes('sourceLanguage: req.body?.sourceLanguage || null'));
  });

  check('the controller logs which source language routed the request', () => {
    assert(controllerSrc.includes('sourceLanguage: ${req.body?.sourceLanguage || \'auto\'}'));
  });

  // -------------------------------------------------------------------------
  // 5. Frontend: state, request payload, and the EN badge rule
  // -------------------------------------------------------------------------
  console.log('\n🖥️  Frontend routing');

  const stateSrc = read('public', 'js', 'state.js');
  const mainSrc = read('public', 'js', 'main.js');
  const subtitlesSrc = read('public', 'js', 'subtitles.js');
  const htmlSrc = read('public', 'index.html');

  check('state carries a sourceLanguage slot', () => {
    assert(stateSrc.includes('sourceLanguage: null'));
  });

  check('main.js stores the language returned by /api/transcribe', () => {
    assert(mainSrc.includes('state.sourceLanguage = result.language || null'));
  });

  check('main.js sends sourceLanguage to /api/translate', () => {
    assert(mainSrc.includes('sourceLanguage: state.sourceLanguage || null'));
  });

  check('main.js distinguishes the direct pipeline in the UI copy', () => {
    assert(mainSrc.includes('isChineseSource'), 'must branch the button/toast copy on the detected language');
    assert(mainSrc.includes('Direct Chinese -> Khmer pipeline'));
  });

  check('subtitles.js gates the EN line behind hasEnglishPivot()', () => {
    assert(subtitlesSrc.includes('hasEnglishPivot(sub)'),
      'the EN block must not render merely because englishText is truthy');
    assert(!/^\s*sub\.englishText\s*$/m.test(subtitlesSrc),
      'the raw `sub.englishText &&` guard should have been replaced');
  });

  check('hasEnglishPivot is exported and suppresses a mirrored original', () => {
    assert(subtitlesSrc.includes('export function hasEnglishPivot'));
    const { hasEnglishPivot } = require(path.join(__dirname, '..', 'public', 'js', 'subtitles.js'));
    // Direct zh->km path mirrors originalText into englishText -> must be hidden.
    assert.strictEqual(hasEnglishPivot({ originalText: '你是不是活腻了？！', englishText: '你是不是活腻了？！' }), false);
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了', englishText: '别闹了' }), false);
    // Case-only differences are still the same text.
    assert.strictEqual(hasEnglishPivot({ originalText: 'Hello', englishText: 'hello' }), false);
    // A real English pivot must be shown.
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了', englishText: "Don't mess around" }), true);
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了', englishText: 'Stop it' }), true);
    // Empty / missing pivot -> hidden.
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了', englishText: '' }), false);
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了', englishText: '   ' }), false);
    assert.strictEqual(hasEnglishPivot({ originalText: '别闹了' }), false);
    assert.strictEqual(hasEnglishPivot({}), false);
    assert.strictEqual(hasEnglishPivot(null), false);
  });

  check('the table header reads ORIGINAL TEXT (the EN pivot is per-row now)', () => {
    assert(htmlSrc.includes('min-w-[150px]">ORIGINAL TEXT</th>'));
    assert(!htmlSrc.includes('ORIGINAL TEXT / ENGLISH'),
      'the header must no longer promise an always-present English line');
  });

  // -------------------------------------------------------------------------
  // 6. Config discoverability
  // -------------------------------------------------------------------------
  console.log('\n⚙️  Configuration');

  check('.env.example documents TRANSLATION_MODE with all three values', () => {
    const example = read('.env.example');
    assert(example.includes('TRANSLATION_MODE=auto'));
    assert(example.includes('bridge'));
    assert(example.includes('direct'));
  });

  console.log(`\n🎉 All ${passed} smart-routing assertions passed!\n`);
})().catch(err => {
  console.error('\n❌ Smart Language Routing test FAILED:\n', err);
  process.exit(1);
});
