# 🎙️ Dubber Project - AI Audio & Video Dubbing Platform

ប្រព័ន្ធស្ថាបត្យកម្មកម្រិតអាជីព (Professional Architecture) សម្រាប់បញ្ចូលសំឡេងវីដេអូជាភាសាខ្មែរស្វ័យប្រវត្តិ **AI Video & Audio Dubbing Platform** ដោយប្រើប្រាស់បច្ចេកវិទ្យាទំនើប **Node.js (Express 5), Faster-Whisper, Google Gemini, Microsoft Edge-TTS, FFmpeg និង Tailwind CSS v4**។

---

## 🌟 លក្ខណៈពិសេសសំខាន់ៗ (Key Features)

- 🎙️ **Speech-to-Text លើម៉ាស៊ីនផ្ទាល់ (Offline Whisper):** ប្រើ Faster-Whisper រួមជាមួយ Voice Activity Detection (VAD) ទាញយក Word Timestamps ច្បាស់លាស់ ដោយមិនចំណាយ Quota API។
- 🌐 **ការបកប្រែជាភាសាខ្មែរបែបភាពយន្ត (2-Step Cinema Translation):** ប្រើ Google Gemini Flash (`GEMINI_TRANSLATION_MODEL`, លំនាំដើម `gemini-3.5-flash-lite`) តាមក្បួនបកប្រែ ២ ជំហាន (EN Context -> Spoken Cinema Khmer) ដោយជៀសវាងការប្រើពាក្យខុសបែបសៀវភៅ ឬពាក្យ Hallucination។
- 🔑 **ប្រព័ន្ធ Multi-Key Failover Pool:** គ្រប់គ្រង API Keys ច្រើនក្នុងពេលតែមួយ មានមុខងារ Auto-Rotation, Cooldown និងចាក់សោស្វ័យប្រវត្ត 24h នៅពេលអស់ Quota។
- 🗣️ **សំឡេងខ្មែរ AI ធម្មជាតិ (Edge-TTS Neural Voices):** គាំទ្រសំឡេងខ្មែរ Neural (Piseth & Sreymom) ជាមួយនឹងការកំណត់ Pitch, Speed និង Volume។
- 🎛️ **Audio Ducking & Auto Speed Fitting:** បន្ថយសំឡេងដើមនៃវីដេអូនៅពេលមានសំឡេងនិយាយ និងតម្រឹមល្បឿនសំឡេង (`atempo`) ឱ្យស៊ីចង្វាក់ជាមួយ Timestamp។
- 🖥️ **Interactive Subtitle Editor (Human-in-the-Loop):** ផ្ទាំង UI ងាយស្រួលកែសម្រួលអក្សរខ្មែរ និង Timestamp ផ្ទាល់លើ Web Player។
- 🔄 **Video Preview & Switcher:** ចុចប្តូរមើលរវាង Original Video និង Dubbed Video ភ្លាមៗដោយមិនបាច់ Reload។
- 💾 **Project Persistence & Auto-Save:** រក្សាទុកស្ថានភាព Subtitles, Key API និង Video ដោយស្វ័យប្រវត្តិ ព្រមទាំងអាច Export/Import ជា JSON បាន។

---

## 🎧 ម៉ាស៊ីនបំប្លែងសំដីទៅជាអក្សរ (Speech-to-Text Providers)

ប្រព័ន្ធគាំទ្រ **ម៉ាស៊ីន STT ចំនួន ៣ ប្រភេទ** ដែលអាចជ្រើសរើសបានផ្ទាល់ពី Dropdown ក្នុង UI។ ការជ្រើសរើសត្រូវបានកំណត់ដោយឈ្មោះ Model៖ បើឈ្មោះចាប់ផ្តើមដោយ `groq-` ប្រព័ន្ធនឹងហៅ Groq, បើ `deepgram-` នឹងហៅ Deepgram, បើផ្សេងពីនេះនឹងហៅ Faster-Whisper ក្នុងម៉ាស៊ីន។

| ប្រភេទ | Model ដែលគាំទ្រ | តម្លៃ | ល្បឿន | តម្រូវការ |
|---|---|---|---|---|
| 💻 **Faster-Whisper (Offline)** | `small`, `medium`, `large-v2`, `large-v3` | ឥតគិតថ្លៃ ($0) | អាស្រ័យលើ CPU/GPU | Python `.venv` + `faster-whisper` |
| ⚡ **Groq Cloud Whisper** | `groq-whisper-large-v3`, `groq-whisper-turbo` | Free Tier | លឿនបំផុត (~2s) | `GROQ_API_KEY` |
| 🌐 **Deepgram Nova** | `deepgram-nova-3`, `deepgram-nova-2` | បង់ប្រាក់ (មាន Free Credit) | លឿន | `DEEPGRAM_API_KEY` |

> [!NOTE]
> ឈ្មោះ Model ផ្សេងទៀតដូចជា `gemini-stt` ក៏មាននៅក្នុង UI ដែរ។ ប្រសិនបើមិនបានកំណត់ API Key សម្រាប់ Provider ណាមួយ សូមជ្រើសរើស Faster-Whisper Offline ដែលមិនត្រូវការ Key។

> [!TIP]
> **ការណែនាំជម្រើស៖** ប្រើ **Groq Whisper Large-v3** សម្រាប់គុណភាព និងល្បឿនល្អបំផុត (ណែនាំសម្រាប់ការងារប្រចាំថ្ងៃ) ឬប្រើ **Faster-Whisper Large-v3** បើចង់ដំណើរការក្រៅបណ្តាញដោយគ្មានការចំណាយ។

### ការកំណត់ API Keys ក្នុង UI
ចុចប៊ូតុង **កំណត់ API Keys (Groq / Gemini)** នៅក្នុង Dropdown ជ្រើស Model ដើម្បីបញ្ចូល Key ផ្ទាល់ (រក្សាទុកក្នុង Browser ប៉ុណ្ណោះ) ឬកំណត់ក្នុងឯកសារ `.env` សម្រាប់ការប្រើប្រាស់ជាប្រចាំ។

---

## 📁 រចនាសម្ព័ន្ធគម្រោង (Directory Structure)

```text
Dubber Project/
├── .git/                      # Git repository
├── .gitignore                 # កំណត់ Ignore ឯកសារ dependencies, secrets, caches, media
├── .env.example               # គំរូ Environment variables
├── .env                       # Environment variables (មិនត្រូវ commit ចូល Git ឡើយ)
├── .key-status.json           # Runtime state នៃ Gemini API Keys (Ignored)
├── package.json               # Node.js dependencies & scripts
├── package-lock.json          # Dependency lockfile (Commit ចូល Git)
├── README.md                  # ឯកសារណែនាំការប្រើប្រាស់ (ឯកសារនេះ)
├── PIPELINE_FLOW.md           # ស្ថាបត្យកម្មប្រព័ន្ធ និងដំណើរការ Pipeline លម្អិត
├── start_dev.bat              # Script ដំណើរការ Server លើ Windows
├── start_full_dev.bat         # Script ដំណើរការទាំង Server + Tailwind Watcher
│
├── src/                       # Backend Source Code (Express 5)
│   ├── server.js              # Server entry point (app.listen)
│   ├── app.js                 # Express configuration, CORS, Static routes
│   ├── config/
│   │   └── index.js           # បណ្តុំ config និង Environment variables
│   ├── routes/
│   │   └── api.routes.js      # API Endpoints (Transcribe, Translate, Voice, Render, etc.)
│   ├── controllers/
│   │   └── dubber.controller.js # Request handlers & error dispatchers
│   ├── middlewares/
│   │   └── errorHandler.js    # Global error & 404 handler
│   ├── services/              # Core Services
│   │   ├── dubber.service.js       # Main orchestration
│   │   ├── gemini.service.js       # 2-step Khmer Cinema translation
│   │   ├── history.service.js      # Project history & autosave persistence
│   │   ├── key-manager.service.js  # Multi-key failover, cooldown & lockout pool
│   │   ├── tts.service.js          # Edge-TTS bridge & audio segment builder
│   │   ├── video-renderer.service.js # FFmpeg mixer, ducking & muxer
│   │   └── whisper.service.js      # Faster-Whisper offline worker runner
│   ├── utils/
│   │   └── terminal-logger.js # CLI terminal log formatter
│   └── workers/               # Python AI Workers
│       ├── tts_worker.py          # Microsoft Edge TTS script
│       └── whisper_transcriber.py # Faster-Whisper Speech-to-Text script
│
├── public/                    # Frontend Static Files
│   ├── index.html             # កម្មវិធី Web Dashboard
│   ├── css/
│   │   ├── input.css          # Tailwind CSS input (@import "tailwindcss";)
│   │   └── output.css         # Compiled Tailwind CSS
│   └── js/
│       ├── main.js            # Frontend orchestrator & UI handlers
│       ├── state.js           # Client state management
│       ├── subtitles.js       # Subtitle table rendering, editing & sync
│       ├── timeline.js        # Timeline controls & visual progress
│       ├── video-player.js    # Custom video player & dual-stream switcher
│       ├── audio-extractor.js # Web Audio API in-browser extraction
│       └── logger.js          # Client-to-terminal logger
│
├── scripts/                   # Helper Scripts
│   ├── translate_khmer_subtitles.js
│   └── update-subtitles.js
│
├── storage/                   # Media & State Storage (Media files ត្រូវ ignore ក្នុង Git)
│   ├── exports/               # វីដេអូនាំចេញចុងក្រោយ (.mp4)
│   ├── history/               # កំណត់ត្រាប្រវត្តិគម្រោង (.json)
│   ├── projects/              # ឯកសារ Auto-save (.json)
│   ├── temp/                  # ឯកសារសំឡេងបណ្តោះអាសន្ន
│   ├── videos/                # វីដេអូដែលបាន Upload ចូល
│   └── voices/                # សំឡេងកាត់ជាកង់ៗដោយ TTS (.mp3)
│
└── tests/                     # Test Suites (30+ automated tests)
    ├── e2e-api.test.js        # Full End-to-End API test suite
    ├── full-pipeline.test.js  # Pipeline test
    ├── key-manager.test.js    # Gemini multi-key pool test
    └── regression-body-limit.test.js
```

---

## 📋 តម្រូវការជាមុន (Prerequisites)

1. **Node.js:** កំណែ `v18.x` ឬខ្ពស់ជាងនេះ (ណែនាំ `v20+` ឬ `v22+`)។
2. **Python:** កំណែ `3.10+` (មានដំឡើង `pip` និង `venv`)។
3. **FFmpeg & FFprobe:** ត្រូវដំឡើង និងដាក់ក្នុង System `PATH`។
   - ពិនិត្យតាមរយៈ៖ `ffmpeg -version`
4. **Python Dependencies:** ដំឡើងក្នុង virtual environment ក្នុងថតគម្រោងផ្ទាល់ (`.venv`) ដើម្បីឱ្យប្រព័ន្ធរកឃើញដោយស្វ័យប្រវត្តិ៖
   ```bash
   # បង្កើត virtual environment ក្នុងថតគម្រោង
   python -m venv .venv

   # ធ្វើឱ្យសកម្ម (Windows)
   .venv\Scripts\activate

   # ធ្វើឱ្យសកម្ម (Linux/macOS)
   source .venv/bin/activate

   # ដំឡើង Dependencies
   pip install faster-whisper edge-tts imageio-ffmpeg
   ```
   > [!NOTE]
   > បើអ្នកប្រើ `.venv` នៅកន្លែងផ្សេង (ឧ. ថតខាងក្រៅគម្រោង) សូមកំណត់ `PYTHON_PATH` ក្នុង `.env` ឱ្យចង្អុលទៅ Interpreter នោះ។

---

## 🚀 របៀបដំឡើង និងដំណើរការ (Installation & Quick Start)

### ១. ដំឡើង Node Dependencies
```bash
npm install
```

### ២. រៀបចំឯកសារ `.env`
ចម្លងគំរូពី `.env.example`៖
```bash
# លើ Windows (CMD)
copy .env.example .env

# លើ PowerShell ឬ Linux/macOS
cp .env.example .env
```
បន្ទាប់មកបើកឯកសារ `.env` ហើយបំពេញតម្លៃដូចខាងក្រោម៖

| អថេរ | ចាំបាច់? | ចំណាំ |
|---|---|---|
| `GEMINI_API_KEY` | ✅ ចាំបាច់ | សម្រាប់ការបកប្រែ (អាចដាក់ច្រើន Keys ដោយប្រើសញ្ញាក្បៀស `,` ឬចុះបន្ទាត់ សម្រាប់ Auto-Failover) |
| `GROQ_API_KEY` | 🔶 ណែនាំ | បើប្រើ Groq Cloud STT (លឿនបំផុត) |
| `DEEPGRAM_API_KEY` | ⭕ ស្រេចចិត្ត | បើប្រើ Deepgram Nova STT |
| `PYTHON_PATH` | ⭕ ស្រេចចិត្ត | ទុកទទេ បើប្រើ `.venv` ក្នុងថតគម្រោង |

> [!IMPORTANT]
> ប្រសិនបើមិនកំណត់ `GROQ_API_KEY` ឬ `DEEPGRAM_API_KEY` សូមជ្រើសរើស Model **Offline (Faster-Whisper)** នៅក្នុង UI ដើម្បីជៀសវាងកំហុស។

### ៣. Build Tailwind CSS
```bash
# Build តែម្ដង
npm run build:css

# ឬដំណើរការ Watch mode ពេលកំពុង Code
npm run watch:css
```

### ៤. ចាប់ផ្ដើមដំណើរការ Server

- **ជម្រើសទី ១ (Windows Batch Script - ងាយស្រួលបំផុត):**
  - ចុចពីរដងលើ `start_dev.bat` (សម្រាប់ Nodemon)
  - ឬចុចលើ `start_full_dev.bat` (សម្រាប់ Server + Tailwind Watcher ដំណាលគ្នា)
- **ជម្រើសទី ២ (Command Line):**
  ```bash
  # សម្រាប់ Development
  npm run dev

  # សម្រាប់ Production
  npm start
  ```

ចូលទៅកាន់ Browser៖
- 🌐 **Web Dashboard:** [http://localhost:5000](http://localhost:5000)
- 🩺 **Health Check:** [http://localhost:5000/api/health](http://localhost:5000/api/health)
- 📊 **System Status:** [http://localhost:5000/api/status](http://localhost:5000/api/status)

---

## 🧪 ការធ្វើតេស្តប្រព័ន្ធ (Running Tests)

គម្រោងនេះមាន Test Suites គ្របដណ្ដប់យ៉ាងទូលំទូលាយ៖

```bash
# តេស្ត End-to-End សំខាន់ៗទាំងអស់ (E2E API Test)
npm test

# ឬបើប្រើ cmd លើ Windows
cmd /c npm test

# តេស្តសមត្ថភាពផ្ទុកទិន្នន័យ Upload Limit
npm run test:regression

# តេស្ត Faster-Whisper Speech-to-Text
npm run test:whisper

# តេស្ត Gemini Translation
npm run test:translate

# តេស្ត Full Pipeline
npm run test:pipeline
```

---

## 🔐 គោលការណ៍ Git & សុវត្ថិភាព (Git & Security Policy)

ដើម្បីការពារកុំឱ្យបែកធ្លាយទិន្នន័យសម្ងាត់ ឬឯកសារ Media ធំៗ ឯកសារខាងក្រោមត្រូវបាន Ignore តាមរយៈ [`.gitignore`](file:///.gitignore)៖

| ប្រភេទឯកសារ | គោលការណ៍ Git | មូលហេតុ |
|---|---|---|
| `.env`, `.env.local` | **Ignore** | ផ្ទុក API Keys និង Passwords សម្ងាត់ |
| `.env.example` | **Commit** | គំរូ Config សម្រាប់អ្នកដទៃយកទៅប្រើ |
| `.key-status.json` | **Ignore** | កត់ត្រា Runtime Lockout State របស់ Key |
| `node_modules/`, `.venv/` | **Ignore** | បណ្ណាល័យ Dependencies ខាងក្រៅ |
| `storage/**` | **Ignore** | ឯកសារវីដេអូ និងសំឡេងធំៗដែលបង្កើតពេលដំណើរការ |
| `storage/**/.gitkeep` | **Commit** | រក្សារចនាសម្ព័ន្ធ Folder ទទេក្នុង Git |
| `tests/*.wav`, `*.mp3`, `*.mp4` | **Ignore** | ឯកសារ Media បណ្តោះអាសន្នពេល Test |

> [!TIP]
> ឯកសារ `package-lock.json` **ត្រូវតែ Commit ចូល Git** ដើម្បីធានាថាកំណែ Library ដូចគ្នានៅគ្រប់កុំព្យូទ័រ។

---

## 🔧 ការដោះស្រាយបញ្ហាទូទៅ (Troubleshooting)

### ⚠️ `npm` មិនដំណើរការក្នុង PowerShell
ប្រសិនបើជួបបញ្ហា `File ... npm.ps1 cannot be loaded because running scripts is disabled on this system`៖
- **ដំណោះស្រាយ ១:** ប្រើ `start_dev.bat` ឬ `cmd /c npm run dev`
- **ដំណោះស្រាយ ២:** បើកសិទ្ធិ PowerShell សម្រាប់ User បច្ចុប្បន្ន៖
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

### ⚠️ កំពង់ផែ (Port 5000) ជាប់រវល់ (EADDRINUSE)
ប្រសិនបើ Server ចាស់មិនទាន់បិទ៖
```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

### ⚠️ Faster-Whisper ឬ Python Worker មិនដំណើរការ
- ពិនិត្យមើលថា `.venv` មានដំឡើង `faster-whisper` និង `edge-tts` រួចរាល់ហើយឬនៅ។
- ប្រព័ន្ធជ្រើសរើស Python Interpreter តាមលំដាប់អាទិភាពដូចខាងក្រោម៖
  1. `PYTHON_PATH` ក្នុង `.env` (បើឯកសារនោះមានពិតប្រាកដ)
  2. `.venv` ក្នុងថតគម្រោង (`./.venv/Scripts/python.exe`)
  3. `python` សកល (Global) នៅក្នុង `PATH`
- បើចង់កំណត់ផ្លូវ Python ច្បាស់លាស់ សូមបើកបន្ទាត់ `PYTHON_PATH` ក្នុង `.env` ហើយដាក់ផ្លូវទៅកាន់ Interpreter របស់អ្នក (គួរបង្កើត `.venv` នៅក្នុងថតគម្រោងផ្ទាល់ ដើម្បីមិនចាំបាច់កំណត់)៖
  ```env
  # គំរូសម្រាប់ Windows — សូមជំនួសដោយផ្លូវពិតលើម៉ាស៊ីនរបស់អ្នក
  PYTHON_PATH=D:\path\to\your\project\.venv\Scripts\python.exe
  ```
  > [!TIP]
  > បើទុក `PYTHON_PATH` ទទេ ប្រព័ន្ធនឹងរកឃើញ `.venv` ក្នុងថតគម្រោងដោយស្វ័យប្រវត្តិ។ នេះជាវិធីណែនាំ ព្រោះវាមិនចងភ្ជាប់នឹងម៉ាស៊ីនណាមួយ។

### ⚠️ FFmpeg រកមិនឃើញ (Command Not Found)
- ត្រូវប្រាកដថាបានដំឡើង FFmpeg និងដាក់ Folder `bin` ចូលទៅក្នុង System Environment Variable `PATH`។
- ផ្ទៀងផ្ទាត់ដោយវាយ៖ `ffmpeg -version`។

---

## 📜 អាជ្ញាប័ណ្ណ (License)
គម្រោងនេះបង្កើតឡើងក្រោមកិច្ចព្រមព្រៀងអាជ្ញាប័ណ្ណ **ISC License**។
