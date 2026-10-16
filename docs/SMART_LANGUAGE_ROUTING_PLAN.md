# ផែនការ — Smart Language Routing (បកប្រែផ្ទាល់តាមភាសាដើម)

**កាលបរិច្ឆេទ:** 2026-10-06
**ស្ថានភាព:** រង់ចាំការអនុម័ត

---

## ១. បញ្ហាបច្ចុប្បន្ន

បច្ចុប្បន្ន Pipeline បង្ខំ **២ ជំហាន** សម្រាប់គ្រប់ករណី៖

```
ចិន ──► [Step 1] ──► អង់គ្លេស ──► [Step 2] ──► ខ្មែរ
                                ↑
                    បង្ហាញក្នុង UI ជា "EN" badge
```

### បញ្ហាដែលអ្នកប្រើជួប

| # | បញ្ហា |
|---|------|
| 1 | បើ Video ជាភាសាចិន ➡️ នៅតែបង្ហាញ **EN badge** ក្រោមចិន |
| 2 | បើ Video ជាភាសាអង់គ្លេស ➡️ បង្ហាញ **ទាំងចិន និងអង់គ្លេស** ស្ទួន |
| 3 | ខ្ជះខ្ជាយ **១ Quota** សម្រាប់ Step 1 ដែលមិនចាំបាច់ (ករណីអង់គ្លេស) |
| 4 | Step 1 (ចិន➡️អង់គ្លេស) អាចបង្ខូចអត្ថន័យ បើ Input ជាអង់គ្លេសស្រាប់ |

### អ្វីដែលអ្នកប្រើចង់

```
ចិន     ──► បកប្រែផ្ទាល់ ──► ខ្មែរ    (គ្មាន EN badge)
អង់គ្លេស ──► បកប្រែផ្ទាល់ ──► ខ្មែរ    (គ្មានចិនស្ទួន)
```

---

## ២. អ្វីដែលប្រព័ន្ធមានរួចហើយ (សំខាន់)

✅ **Language Detection មានរួចហើយ!** ប៉ុន្តែត្រូវបាន **បោះបង់ចោល**៖

| កន្លែង | ស្ថានភាព |
|------|--------|
| `whisper_transcriber.py:210` | `detected_lang = getattr(info, "language", "unknown")` ✅ |
| `whisper_transcriber.py:270` | `"language": detected_lang` ក្នុង JSON output ✅ |
| `whisper.service.js:128` | អាន `parsed.language` សម្រាប់ Log តែប៉ុណ្ណោះ ⚠️ |
| `dubber.controller.js:151` | `res.json({ success, data: subtitles })` ❌ **បោះបង់ `language`!** |
| `groq.service.js:364` | `const detectedLang = json.language \|\| 'unknown'` ⚠️ ដូចគ្នា |
| `main.js` | មិនទទួល `language` ទាល់តែសោះ ❌ |

➡️ **សេចក្តីសន្និដ្ឋាន៖** យើងគ្រាន់តែត្រូវ **ភ្ជាប់ខ្សែដែលដាច់** — មិនចាំបាច់បង្កើត Detection ថ្មីទេ។

---

## ៣. ស្ថាបត្យកម្មថ្មី

### គំនិតស្នូល — ជ្រើស Route តាមភាសាដែលរកឃើញ

```
Transcription Result
{
  language: "zh" | "en" | ...,
  data: [ subtitles ]
}
        │
        ▼
┌───────────────────────────────────────┐
│  ROUTER (new)                         │
│  if lang == 'zh'  ➜ Route A (zh→km)  │  ១ ជំហាន / ១ Quota
│  if lang == 'en'  ➜ Route B (en→km)  │  ១ ជំហាន / ១ Quota
│  else             ➜ Route C (legacy)  │  ២ ជំហាន / ២ Quota
└───────────────────────────────────────┘
```

### ហេតុអ្វីរក្សា Route C?

បើភាសាជា **ជប៉ុន / កូរ៉េ / ថៃ** ជាដើម ➡️ គ្មាន Prompt ផ្ទាល់ទេ។
ដូច្នេះត្រូវឆ្លងកាត់អង់គ្លេសជា Bridge (ដូចបច្ចុប្បន្ន)។

---

## ៤. ផែនការអនុវត្ត — ៥ ជំហាន

### ជំហាន ១ — បង្កើត Prompt ថ្មី ២ (Chinese ➜ Khmer Direct)

**ឯកសារ:** `src/prompts/translation-prompts.js`

បន្ថែម `buildZhToKmPrompt(inputLines)` ដោយផ្សំច្បាប់៖

| យកពី | ច្បាប់ |
|------|------|
| Step 1 | ASR Homophone Disambiguation (`占 vs 站`, `奶狗 vs 乃哥`) |
| Step 1 | Decode Memes/Slang (`小奶狗` = puppy boyfriend) |
| Step 1 | Preserve Comedic Punchlines |
| Step 2 | Natural Spoken Cinema Khmer |
| Step 2 | **ហាម `ៗ`** → សរសេរពាក្យពីរដង |
| Step 2 | Anti `ចាស់` Guard |
| Step 2 | Rhetorical Anger («ឯងចង់ងាប់ហើយមែនទេ?!») |
| Step 2 | Time Budget ៣ ថ្នាក់ |
| Step 2 | Remove Padding |
| Step 2 | Proper Nouns ➜ Khmer |
| Step 2 | Numbers & Currency |
| Step 2 | Edge-TTS Phonetic (`ចេតណា`, `ខ្សែរក`) |
| Step 2 | Strict JSON `{"khmerText"}` |

**លទ្ធផល:** Prompt តែមួយ ដែលធ្វើការងារទាំង ២ ក្នុងពេលតែមួយ។

> ⚠️ **ចំណាំ:** ការបញ្ចូល ASR Correction ចូល Step តែមួយ អាចធ្វើឱ្យគុណភាពធ្លាក់ខ្លះ។ ប៉ុន្តែសន្សំ ១ Quota ➕ លុប EN badge។

### ជំហាន ២ — ភ្ជាប់ Language ពី Backend

| ឯកសារ | ការកែ |
|------|------|
| `whisper.service.js` | `resolve({ segments, language })` ជំនួស `resolve(segments)` |
| `groq.service.js` | ដូចគ្នា — បញ្ជូន `detectedLang` ត្រឡប់ |
| `deepgram.service.js` | ដូចគ្នា |
| `dubber.controller.js` | `res.json({ success, data: subtitles, language })` |
| `main.js` | `state.sourceLanguage = result.language \|\| 'unknown'` |

**ការផ្លាស់ប្តូរទម្រង់ Response:**
```json
// មុន
{ "success": true, "data": [...] }

// ក្រោយ (បន្ថែម ១ Field — backward compatible)
{ "success": true, "data": [...], "language": "zh" }
```

### ជំហាន ៣ — បង្កើត Router ក្នុង `gemini.service.js`

បន្ថែម Method ថ្មី `translateDirect(subtitles, customApiKey, options)`៖

```js
async translateDirect(subtitles, customApiKey, options) {
  const lang = options.sourceLanguage;

  if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-tw') {
    return this.translateChineseToKhmer(subtitles, customApiKey, options);   // ១ Quota
  }
  if (lang === 'en') {
    return this.translateEnglishToKhmer(subtitles, customApiKey, options);   // ១ Quota
  }
  return this.translateSubtitles(subtitles, customApiKey, options);          // ធ្លាក់ទៅ ២ ជំហាន
}
```

➕ បន្ថែម `translateChineseToKhmer()` ដែលប្រើ `buildZhToKmPrompt`

### ជំហាន ៤ — ភ្ជាប់ Frontend

| ឯកសារ | ការកែ |
|------|------|
| `main.js` | ផ្ញើ `sourceLanguage: state.sourceLanguage` ទៅ `/api/translate` |
| `dubber.controller.js` | អាន `sourceLanguage` ➕ ហៅ `translateDirect()` |
| `subtitles.js` | បង្ហាញ **EN badge តែពេល `state.sourceLanguage !== 'en'`** |

**តក្កវិជ្ជាការបង្ហាញ:**

| ភាសាដើម | `originalText` | EN badge | Khmer |
|--------|------------|--------|------|
| `zh` | ចិន | ❌ លាក់ | បកផ្ទាល់ |
| `en` | អង់គ្លេស | ❌ លាក់ | បកផ្ទាល់ |
| `ja` / `ko` | ជប៉ុន | ✅ បង្ហាញ | ឆ្លងកាត់ EN |

```js
// subtitles.js — លក្ខខណ្ឌ EN badge
const shouldShowEnglish = sub.englishText
  && sub.englishText.trim() !== (sub.originalText || '').trim();
```

> 💡 **ចំណាំឆ្លាតវៃ:** ដោយប្រៀបធៀប `englishText !== originalText` យើងអាចលាក់ EN badge **ដោយស្វ័យប្រវត្តិ** ទាំងករណី English Direct (ព្រោះអត្ថបទដូចគ្នា) ➕ ករណី zh→km (ព្រោះ `englishText` ទទេ)។

### ជំហាន ៥ — កែ Header តារាង

| មុន | ក្រោយ |
|------|------|
| `ORIGINAL TEXT / ENGLISH` | **`ORIGINAL TEXT`** (ត្រឡប់វិញ) |

➕ Optional: Badge តូចបង្ហាញភាសា (`ZH`, `EN`, `JA`) នៅក្បែរ Header

---

## ៥. តារាងប្រៀបធៀប

| សេណារីយ៉ូ | បច្ចុប្បន្ន | ក្រោយកែ |
|---------|--------|--------|
| វីដេអូចិន | ២ ជំហាន, ២ Quota, EN badge | **១ ជំហាន, ១ Quota, គ្មាន badge** |
| វីដេអូអង់គ្លេស | ២ ជំហាន (ខ្ជះខ្ជាយ), ស្ទួន | **១ ជំហាន, ១ Quota, ស្អាត** |
| វីដេអូជប៉ុន/កូរ៉េ | ២ ជំហាន | ២ ជំហាន (ដូចដើម) |

**ការសន្សំសំចៃ:**
- Quota: **ថយ ៥០%** សម្រាប់ចិន/អង់គ្លេស
- ល្បឿន: **លឿន ២ ដង** (១ API call ជំនួស ២)
- UI: **ស្អាតជាង** (គ្មាន EN badge ស្ទួន)

---

## ៦. ផលប៉ះពាល់លើ Tests

| Test | ការកែ |
|------|------|
| `translation-prompts.test.js` | ➕ Assertions សម្រាប់ `buildZhToKmPrompt` |
| `e2e-api.test.js` | Header assert ➜ `ORIGINAL TEXT` |
| `test-subtitle-fullscreen.test.js` | ដូចគ្នា |
| `dubbing-settings.test.js` | ពិនិត្យ `endPadding` នៅតែ OK |
| `comprehensive-two-step-translation-review.test.js` | ត្រូវពិនិត្យ — អាចត្រូវ update |
| **ថ្មី** | `smart-language-routing.test.js` |

---

## ៧. លំដាប់អនុវត្ត

```
┌─────────────────────────────────────────────────┐
│  ១. Prompt ថ្មី (buildZhToKmPrompt)              │  ← គ្រឹះ
├─────────────────────────────────────────────────┤
│  ២. Language ពី Backend ➜ Frontend               │  ← ភ្ជាប់ខ្សែ
├─────────────────────────────────────────────────┤
│  ៣. Router translateDirect()                     │  ← ខួរក្បាល
├─────────────────────────────────────────────────┤
│  ៤. UI Badge Logic + Header                      │  ← មុខមាត់
├─────────────────────────────────────────────────┤
│  ៥. Tests & Verification                         │  ← ការពារ
└─────────────────────────────────────────────────┘
```

---

## ៨. ហានិភ័យដែលទទួលយក (Risk Acceptance)

យោងតាមការស្នើរបស់អ្នក — **មិនយកចិត្តទុកដាក់លើហានិភ័យ**។ ប៉ុន្តែខ្ញុំកត់ត្រាទុកដើម្បីតម្លាភាព៖

| ហានិភ័យ | កម្រិត | ចំណាំ |
|--------|------|------|
| គុណភាព zh➜km ធ្លាក់ខ្លះ (គ្មាន English bridge) | មធ្យម | ត្រូវសាកល្បងជាមួយវីដេអូពិត |
| ASR Homophone អាចមិនត្រូវកែពេញលេញ | មធ្យម | Prompt ថ្មីបញ្ចូលច្បាប់នេះហើយ |
| ងាយស្រួលត្រឡប់ក្រោយ (Reversible) | ទាប | រក្សា `translateSubtitles()` ដើមទុក |
| Test ចាស់អាចបរាជ័យ | ទាប | ត្រូវ update ក្នុងជំហាន ៥ |

**យន្តការការពារ:** រក្សា `translateSubtitles()` (២ ជំហាន) ជា **Fallback** ➕ បន្ថែម Env Var `TRANSLATION_MODE=direct|bridge|auto` ដើម្បីបិទ/បើកបានភ្លាមៗ។

---

## ៩. លទ្ធផលរំពឹង

```
វីដេអូចិន:
  你让我买单想 什么昵小傻瓜当然 是你买单
  ─────────────────────────────
  ឯងឱ្យខ្ញុំបង់លុយហ្អី? ឯងគិតអ្វីហ្នឹង ឆ្កួតហើយ
  ពិតជាឯងបង់ហើយ ខ្ញុំចាយលុយអស់ហើយ

វីដេអូអង់គ្លេស:
  You want me to pay? What are you thinking...
  ─────────────────────────────
  ឯងឱ្យខ្ញុំបង់លុយហ្អី? ឯងគិតអ្វីហ្នឹង ឆ្កួតហើយ

✅ គ្មាន EN badge
✅ គ្មានអត្ថបទស្ទួន
✅ ១ Quota ជំនួស ២
```
