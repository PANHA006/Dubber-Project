# ផែនការ — បង្កើត Local `.venv` សម្រាប់ Dubber Project

> **កាលបរិច្ឆេទ:** 2026-10-05
> **គោលដៅ:** ធ្វើឱ្យ project ឯករាជ្យពី folder ខាងក្រៅ (`create-dubber-project`)
> **ការសម្រេចចិត្តរបស់អ្នក:** Python **3.14** + **លុប `PYTHON_PATH` ចេញទាំងស្រុង**

---

## 🎯 គោលដៅចុងក្រោយ

**មុន:**
```
D:/Desktop/
├── Dubber Project/            ← គ្មាន .venv
└── create-dubber-project/
    └── .venv/                 ← ខ្ចីពីទីនេះ ⚠️
```

**ក្រោយ:**
```
D:/Desktop/Dubber Project/
├── .venv/                     ← ✅ ផ្ទាល់ខ្លួន
├── requirements.txt           ← ✅ ថ្មី (កត់ត្រា dependencies)
└── .env  → (គ្មាន PYTHON_PATH) ← auto-detect
```

---

## 📋 ព័ត៌មានដែលបានផ្ទៀងផ្ទាត់រួច (Verified Facts)

| ចំណុច | ស្ថានភាព |
|---|---|
| Python 3.14 ដំឡើងរួច (`py -3.14`) | ✅ `Python 3.14.7` |
| `venv` module ដំណើរការ | ✅ |
| `pip 26.2.1` ដំណើរការ | ✅ |
| `.gitignore` មាន `.venv/` រួច | ✅ បន្ទាត់ 10 |
| ទំហំ disk ទំនេរ | ✅ 37 GB |
| `requirements.txt` | ❌ គ្មាន — ត្រូវបង្កើត |
| venv ចាស់មាន packages | `faster-whisper 1.2.1`, `edge-tts 7.2.8`, `imageio-ffmpeg 0.6.0` |
| config auto-detect `./.venv` | ✅ `src/config/index.js:37-43` |

**⚠️ ចំណាំសំខាន់:** Packages នឹងត្រូវដំឡើងថ្មី (`pip install`) មិនមែនចម្លងទេ។ ដូច្នេះ versions អាចខុសបន្តិចពី venv ចាស់។ ប៉ុន្តែបើ Python 3.14 ខ្វះ wheel សម្រាប់ package ណាមួយ យើងនឹងដឹងភ្លាម ហើយអាចដោះស្រាយ។

---

## 🔧 ផែនការអនុវត្ត — ៧ ជំហាន

### ជំហានទី ១: Backup សុវត្ថិភាព
```bash
# Backup .env (បើមានបញ្ហា អាចត្រឡប់វិញ)
cp .env .env.backup_2026-10-05
```
**ហេតុអ្វី:** ការកែ `.env` អាចមានកំហុស។ Backup ធានាថាអ្នកមិនបាត់ API keys។

---

### ជំហានទី ២: បង្កើត `.venv` ក្នុង project
```bash
cd "D:/Desktop/Dubber Project"
py -3.14 -m venv .venv
```
**ពេលវេលា:** ~15 វិនាទី
**ទំហំ:** ~30 MB (ទទេ, មិនទាន់មាន packages)
**លទ្ធផលរំពឹងទុក:** មាន folder `.venv/Scripts/python.exe`

**ការផ្ទៀងផ្ទាត់:**
```bash
.venv/Scripts/python.exe --version     # គួរបង្ហាញ Python 3.14.7
```

---

### ជំហានទី ៣: Upgrade pip (សុវត្ថិភាព)
```bash
.venv/Scripts/python.exe -m pip install --upgrade pip
```
**ហេតុអ្វី:** pip ថ្មីជួយរក wheel បានល្អជាង ជាពិសេសលើ Python 3.14 ថ្មី។

---

### ជំហានទី ៤: ដំឡើងបណ្ណាល័យទាំង ៣
```bash
.venv/Scripts/python.exe -m pip install faster-whisper edge-tts imageio-ffmpeg
```

**ពេលវេលា:** ~2-5 នាទី (ទាញយកពី internet)
**ទំហំបន្ថែម:** ~1-2 GB (រួម `ctranslate2`, `onnxruntime`, `av`, `tokenizers`, `numpy`)

**Packages ដែលនឹងដំឡើង (ប្រហាក់ប្រហែល):**
| Package | Version ប៉ាន់ស្មាន | មុខងារ |
|---|---|---|
| `faster-whisper` | 1.2.x | STT ក្នុងម៉ាស៊ីន |
| `edge-tts` | 7.x | សំឡេងខ្មែរ AI |
| `imageio-ffmpeg` | 0.6.x | FFmpeg សម្រាប់ workers |
| `ctranslate2` | 4.x | ម៉ាស៊ីន inference |
| `onnxruntime` | 1.x | VAD (Silero) |
| `av` | 18.x | decode audio |

**⚠️ ចំណុចសង្កេត:** បើ Python 3.14 ខ្វះ wheel សម្រាប់ package ណាមួយ (ឧ. `ctranslate2`, `onnxruntime`) → pip នឹងព្យាយាម compile ពី source ដែលអាចបរាជ័យ។ **បើកើតឡើង ខ្ញុំនឹងរាយការណ៍ភ្លាម ហើយស្នើដំណោះស្រាយ** (ប្រើ Python 3.12 ជំនួស)។

**ការផ្ទៀងផ្ទាត់:**
```bash
.venv/Scripts/python.exe -c "import faster_whisper, edge_tts, imageio_ffmpeg; print('✅ ALL 3 OK')"
```

---

### ជំហានទី ៥: បង្កើត `requirements.txt`
```text
faster-whisper==<version ដែលបានដំឡើង>
edge-tts==<version>
imageio-ffmpeg==<version>
```
**ហេតុអ្វី:** កត់ត្រា versions ច្បាស់លាស់ ដើម្បីឱ្យអ្នកដទៃ (ឬអ្នកខ្លួនឯងនៅពេលក្រោយ) អាចដំឡើងដូចគ្នាបានយ៉ាងងាយ៖
```bash
pip install -r requirements.txt
```
**ការបង្កើតដោយស្វ័យប្រវត្តិ:**
```bash
.venv/Scripts/pip.exe freeze > requirements.txt
# រួចកែឱ្យត្រឹមតែ 3 packages សំខាន់
```

---

### ជំហានទី ៦: កែ `.env` (លុប `PYTHON_PATH`)
```diff
  GEMINI_MODEL=gemini-3.6-flash
  GEMINI_TRANSLATION_MODEL=gemini-3.5-flash-lite
  TRANSCRIPTION_ENGINE=whisper
  WHISPER_MODEL=base
-
- # ===================================================================
- # 🐍 PYTHON INTERPRETER ...
- PYTHON_PATH=D:\Desktop\create-dubber-project\.venv\Scripts\python.exe
+ # PYTHON_PATH ត្រូវបានលុប — ប្រព័ន្ធរកឃើញ ./.venv ដោយស្វ័យប្រវត្តិ
```

**ហេតុអ្វីមានសុវត្ថិភាព:** `src/config/index.js:37-43` ពិនិត្យ `repoRoot/.venv/Scripts/python.exe` ដោយស្វ័យប្រវត្តិ។ ដូច្នេះបើ `PYTHON_PATH` ទទេ → វានឹងប្រើ `.venv` ថ្មី។

---

### ជំហានទី ៧: ផ្ទៀងផ្ទាត់ទាំងស្រុង
```bash
# ១. ពិនិត្យ config ជ្រើស python ណា
node -e "console.log(require('./src/config').pythonPath)"
# គួរបង្ហាញ: D:\Desktop\Dubber Project\.venv\Scripts\python.exe

# ២. Restart server (nodemon នឹង restart ដោយស្វ័យប្រវត្តិពេលកែ .env)
curl http://localhost:5000/api/status

# ៣. រត់ test suite
npm test

# ៤. ពិនិត្យ venv ចាស់ថាមិនត្រូវបានប្រើទៀត
# (លទ្ធផលគួរបង្ហាញ path ថ្មី)
```

---

## ✅ លក្ខខណ្ឌជោគជ័យ (Acceptance Criteria)

| # | លក្ខខណ្ឌ | វិធីផ្ទៀងផ្ទាត់ |
|---|---|---|
| ១ | `.venv/Scripts/python.exe` មានពិត | `ls .venv/Scripts/python.exe` |
| ២ | បណ្ណាល័យ ៣ ដំឡើងរួច | `python -c "import faster_whisper, edge_tts, imageio_ffmpeg"` |
| ៣ | គ្មាន error ក្នុងការដំឡើង | pip output បញ្ចប់ដោយ "Successfully installed" |
| ៤ | `requirements.txt` បង្កើតរួច | `cat requirements.txt` |
| ៥ | `.env` គ្មាន `PYTHON_PATH` សកម្ម | `grep "^PYTHON_PATH" .env` → ទទេ |
| ៦ | config ជ្រើស `.venv` ថ្មី | node one-liner ខាងលើ |
| ៧ | Server ដំណើរការល្អ | `/api/status` → 200 |
| ៨ | Test suite ជាប់ទាំងអស់ | `npm test` → 33 pass |
| ៩ | លុប venv ចាស់ក៏មិនខូច | (សាកល្បងស្រេចចិត្ត) |

---

## 🛡️ ផែនការបម្រុង (Rollback)

បើមានបញ្ហា ការត្រឡប់វិញងាយស្រួលណាស់៖
```bash
# ស្តារ .env ចាស់
cp .env.backup_2026-10-05 .env

# លុប .venv ថ្មី (បើចង់)
rm -rf .venv
```
ដូច្នេះប្រព័ន្ធនឹងត្រឡប់ទៅប្រើ `create-dubber-project/.venv` វិញភ្លាម។

---

## ⚠️ ហានិភ័យ និងការដោះស្រាយ

| ហានិភ័យ | លទ្ធភាព | ដំណោះស្រាយ |
|---|---|---|
| Python 3.14 ខ្វះ wheel (`ctranslate2`/`onnxruntime`) | មធ្យម | ប្រើ Python 3.12 ជំនួស |
| ការទាញយកយឺត/ខូច | ទាប | ព្យាយាមម្តងទៀត |
| Disk មិនគ្រប់គ្រាន់ | ទាប (មាន 37 GB) | — |
| venv ចាស់ខូចពេលកំពុងធ្វើ | ស្ទើរតែមិនកើត | យើងមិនប៉ះវាទេ |

---

## ⏱️ ពេលវេលាប៉ាន់ស្មាន

| ជំហាន | ពេលវេលា |
|---|---|
| Backup + បង្កើត venv | ~20 វិនាទី |
| Upgrade pip | ~15 វិនាទី |
| ដំឡើង 3 packages | ~2-5 នាទី ⏳ |
| requirements + កែ .env | ~1 នាទី |
| ផ្ទៀងផ្ទាត់ + tests | ~2 នាទី |
| **សរុប** | **~5-9 នាទី** |

---

## 📌 ចំណុចត្រូវសម្រេចចិត្តបន្ថែម

1. **តើលុប venv ចាស់ (`create-dubber-project`) ទេ?** — ខ្ញុំ **មិនណែនាំ** ឱ្យលុបឥឡូវ។ សូមរង់ចាំបញ្ជាក់ថា `.venv` ថ្មីដំណើរការល្អ ១០០% ជាមុនសិន។
2. **តើ commit `requirements.txt` ទេ?** — ខ្ញុំ **ណែនាំ** ឱ្យ commit ព្រោះវាជាឯកសារ project ត្រឹមត្រូវ។
3. **តើដំឡើង `--no-cache-dir` ទេ?** — មិនចាំបាច់ ប៉ុន្តែបើចង់សន្សំ disk អាចប្រើ។
