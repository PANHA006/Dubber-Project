# ផែនការកែសម្រួល Prompt បកប្រែ — 2026-10-05

## គោលបំណង

យក Prompt បកប្រែ "Professional Movie Dubbing Translator" របស់អ្នក មកកែសម្រួល
ឱ្យស៊ីគ្នា 100% ជាមួយ Pipeline ពិតរបស់ Project (DAI Dubber Pro)។

## បញ្ហាដែលរកឃើញ (ពីការវិភាគ)

| # | បញ្ហា | ដំណោះស្រាយដែលបានជ្រើស |
|---|------|---------------------|
| 1 | `INPUT SHAPE:` ទទេ គ្មាន Schema | បញ្ចូល JSON schema ពិតតាម `main.js` → `/api/translate` |
| 2 | គ្មាន `OUTPUT FORMAT` → `JSON.parse()` នឹងបរាជ័យ | បង្ខំ Strict JSON `{"1":{"englishText"}}` / `{"1":{"khmerText"}}` |
| 3 | ជម្លោះ «ៗ» ជាមួយកូដបច្ចុប្បន្ន | **រក្សា `ៗ`** (កូដបច្ចុប្បន្នត្រូវ) — លុបច្បាប់ "ហាម ៗ" ចេញ |
| 4 | ឧទាហរណ៍លេខខុស (100,000 → មួយលាន) | កែជា មួយសែន / មួយលាន / ម្ភៃបីលាន |
| 5 | Speed x1.0–x1.7 ជម្លោះនឹង `tts_worker.py` | លុប SPEED RULE — TTS clamp 1.05–1.35 ដោយស្វ័យប្រវត្តិ |
| 6 | Names vs Language Detection ផ្ទុយគ្នា | បញ្ជាក់ Exception: Latin proper nouns → transliterate |
| 7 | Task `zh-cn` តែមួយ តែ Detection មាន en | សរសេរ Task 2 ជំហានឱ្យច្បាស់ |
| 8 | ខ្វះ Consistency Rule | បន្ថែមច្បាប់ Consistency |

## ស្ថាបត្យកម្មពិតដែលត្រូវគោរព

```
Subtitle { id, start, end, startSec, endSec, originalText, englishText, khmerText }
        │
        ├─ STEP 1: zh/en ──► English   (temperature 0.2, JSON {"englishText"})
        │           ច្បាប់: Homophone fix + Meme/Slang + Conversational
        │
        └─ STEP 2: English ─► Khmer    (temperature 0.2, JSON {"khmerText"})
                    Input: "1. [Duration: 2.7s, Max Words: ~9] text"
                    ច្បាប់ 6: Cinema Khmer / ចាស់ៗ guard / Anger / Time budget / Padding / JSON
```

## អនុវត្ត

| ជំហាន | ឯកសារ | ស្ថានភាព |
|------|------|--------|
| A | `src/prompts/translation-prompts.js` (បង្កើតថ្មី) | ⏳ |
| B | `src/services/gemini.service.js` (កែឱ្យ require) | ⏳ |
| C | `tests/translation-prompts.test.js` (បង្កើតថ្មី) | ⏳ |
| D | `npm test` ផ្ទៀងផ្ទាត់ 33/33 | ⏳ |

## គោលការណ៍រចនា

1. **មិនបែងចែក Prompt ចេញពី Service** បើគ្មានហេតុផល — តែនៅទីនេះមានហេតុផល៖
   Prompt វែង និងជា Domain Knowledge ដែលគួរ Version-Control ដោយឡែក
2. **រក្សា Behavior ដើមទាំងអស់** — មិនផ្លាស់ API, មិនផ្លាស់ Signature
3. **ពង្រឹងតែអ្វីដែលខ្វះ** — បន្ថែម INPUT/OUTPUT Schema, Numbers, Consistency
