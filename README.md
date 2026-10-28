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

## 📦 កញ្ចប់កម្មវិធី និងបណ្ណាល័យដែលចាំបាច់ (Required Packages & Libraries)

ដើម្បីដំណើរការប្រព័ន្ធនេះបានរលូន លោកអ្នកត្រូវមានបណ្ណាល័យសំខាន់ៗទាំងផ្នែក **Node.js**, **Python**, និង **System Tools** ដូចខាងក្រោម៖

### ១. Node.js Packages (ដំឡើងតាមរយៈ `npm install`)
គម្រោងនេះដំណើរការលើ **Node.js (Express v5)** ដោយប្រើប្រាស់បណ្ណាល័យផ្លូវការទំនើបៗ៖

| Package Name | ប្រភេទ | តួនាទី និងសារៈសំខាន់ (Purpose) |
|---|---|---|
| **`express`** (`^5.2.1`) | Production | Web Framework ស្នូលសម្រាប់គ្រប់គ្រង RESTful API endpoints, static web files, និង routing |
| **`@google/genai`** (`^2.22.0`) | Production | SDK ផ្លូវការរបស់ Google Gemini AI សម្រាប់ដំណើរការបកប្រែជាភាសាខ្មែរកម្រិតភាពយន្ត (Cinema Khmer Translation) |
| **`multer`** (`^2.4.0`) | Production | គ្រប់គ្រងការ Upload ឯកសារទំហំធំ (វីដេអូ MP4, សំឡេង Audio, RVC Voice Models) |
| **`cors`** (`^2.8.6`) | Production | អនុញ្ញាត និងការពារសុវត្ថិភាព Cross-Origin Resource Sharing |
| **`dotenv`** (`^17.4.2`) | Production | ទាញយក Environment Variables ពីឯកសារ `.env` ចូលទៅក្នុង Process Runtime |
| **`tailwindcss`** (`^4.3.3`) | DevDependency | CSS Engine ជំនាន់ថ្មី (v4) សម្រាប់រៀបចំ UI Web Dashboard ឱ្យមានភាពទាក់ទាញ និង Modern |
| **`@tailwindcss/cli`** (`^4.3.3`) | DevDependency | Command-line tool សម្រាប់ Compile Tailwind CSS ចូលទៅកាន់ `public/css/output.css` |
| **`nodemon`** (`^3.1.14`) | DevDependency | Auto-reload Node.js server ដោយស្វ័យប្រវត្តិនៅពេលកែសម្រួលកូដ (Hot Reloading) |
| **`postcss`** & **`autoprefixer`** | DevDependency | Toolchain សម្រាប់ parse និងបន្ថែម CSS vendor prefixes ស្វ័យប្រវត្តិ |

---

### ២. Python Packages (ដំឡើងក្នុង Virtual Environment `.venv`)
ប្រព័ន្ធដំណើរការ AI Background Workers មួយចំនួនតាមរយៈ Python 3.10+៖

| Python Library | តួនាទី និងសារៈសំខាន់ (Purpose) |
|---|---|
| **`faster-whisper`** | ម៉ាស៊ីន AI Speech-to-Text ក្នុងកុំព្យូទ័រផ្ទាល់ (Offline $0) ទាញយក Word Timestamps ច្បាស់លាស់ ដោយមិនចាំបាច់មាន Internet ឬ API Key |
| **`edge-tts`** | បច្ចេកវិទ្យា Microsoft Neural Speech សម្រាប់បន្លឺសំឡេងខ្មែរធម្មជាតិ (សំឡេងប្រុស **Piseth** និងសំឡេងស្រី **Sreymom**) ដោយឥតគិតថ្លៃ |
| **`imageio-ffmpeg`** | ផ្តល់ Python bindings និង utilities សម្រាប់បញ្ជូន Stream ទិន្នន័យសំឡេងជាមួយ FFmpeg |

---

### ៣. ឧបករណ៍ប្រព័ន្ធ (System Binary Tools)
| ឧបករណ៍ | តម្រូវការ | តួនាទី (Purpose) |
|---|---|---|
| **`FFmpeg` & `FFprobe`** | កំណែ `v4.3+` (ណែនាំ `v6.x` ឬ `v7.x`) | ប្រើប្រាស់សម្រាប់ Audio Ducking, BGM Isolation, Multi-core parallel audio mixing, Subtitle muxing, និង Fast stream copy export |

---

## 🚀 របៀបដំឡើង និងដំណើរការជំហានៗ (How to Run Step-by-Step)

សូមអនុវត្តតាមជំហានងាយៗខាងក្រោមដើម្បីតម្លើង និងដំណើរការគម្រោងពីដំបូង៖

### ជំហានទី ១: Clone គម្រោងពី GitHub
```bash
git clone https://github.com/PANHA006/Dubber-Project.git
cd Dubber-Project
```

### ជំហានទី ២: ដំឡើង Node.js Dependencies
```bash
npm install

# ធ្វើឱ្យសកម្ម Git Hooks សុវត្ថិភាព (ការពារកុំឱ្យច្រឡំ commit secret keys)
npm run setup:hooks
```

### ជំហានទី ៣: បង្កើត និងដំឡើង Python Virtual Environment (`.venv`)
```bash
# ១. បង្កើត virtual environment ក្នុង folder គម្រោង
python -m venv .venv

# ២. Activate Virtual Environment
# លើ Windows (Command Prompt ឬ PowerShell):
.venv\Scripts\activate

# លើ macOS / Linux:
source .venv/bin/activate

# ៣. ដំឡើង Python Packages ដែលចាំបាច់
pip install faster-whisper edge-tts imageio-ffmpeg
```

### ជំហានទី ៤: រៀបចំឯកសារកំណត់រចនាសម្ព័ន្ធ (`.env`)
ចម្លងគំរូឯកសារ `.env.example` ទៅជា `.env`៖
```bash
# លើ Windows
copy .env.example .env

# លើ macOS / Linux
cp .env.example .env
```

បើកឯកសារ `.env` ហើយកំណត់ Keys តាមតម្រូវការ៖
```env
# Port ដំណើរការ Server
PORT=5000

# Gemini API Keys (សម្រាប់បកប្រែជាភាសាខ្មែរកម្រិតភាពយន្ត)
# អាចដាក់ Key មួយ ឬច្រើនចែកដោយសញ្ញាក្បៀស (,) សម្រាប់ Auto-Failover
GEMINI_API_KEY=AIzaSy...

# Groq Cloud API Key (ស្រេចចិត្ត - ប្រសិនបើចង់ប្រើ Groq Whisper STT ល្បឿនលឿន ២ វិនាទី)
GROQ_API_KEY=gsk_...

# Deepgram API Key (ស្រេចចិត្ត - ប្រសិនបើចង់ប្រើ Deepgram Nova-3)
DEEPGRAM_API_KEY=...
```

> [!NOTE]
> **តើធ្វើដូចម្តេចប្រសិនបើគ្មាន Gemini API Key?**
> លោកអ្នកនៅតែអាចប្រើប្រាស់មុខងារបកប្រែបាន ១០០% ដោយសារប្រព័ន្ធមានបំពាក់មុខងារ **Free Google Translate (GTX)** ដែលអនុញ្ញាតឱ្យបកប្រែ Subtitles ភ្លាមៗដោយមិនចាំបាច់មាន API Key ឡើយ!

### ជំហានទី ៥: Build Tailwind CSS
```bash
# Build ឯកសារ CSS សម្រាប់ Production
npm run build:css

# ឬបើក Watcher ប្រសិនបើលោកអ្នកចង់កែសម្រួល Design
npm run watch:css
```

### ជំហានទី ៦: ចាប់ផ្ដើមដំណើរការ Server

លោកអ្នកមានជម្រើសជាច្រើនក្នុងការ Run Server៖

- **ជម្រើស A (1-Click Run លើ Windows - ងាយស្រួលបំផុត):**
  - ចុចពីរដងលើឯកសារ `start_dev.bat` (ដំណើរការ Server ជាមួយ Nodemon Auto-restart)
  - ឬចុចពីរដងលើ `start_full_dev.bat` (ដំណើរការទាំង Express Server និង Tailwind CSS Watcher ដំណាលគ្នា)

- **ជម្រើស B (តាមរយៈ Terminal / Command Line):**
  ```bash
  # សម្រាប់ Development (Nodemon Hot-Reload)
  npm run dev

  # សម្រាប់ Development ពេញលេញ (Server + Tailwind CSS Auto-compile)
  npm run dev:all

  # សម្រាប់ Production Run
  npm start
  ```

### ជំហានទី ៧: បើក Dashboard លើ Web Browser
នៅពេល Server ចាប់ផ្ដើមជោគជ័យ សូមបើក Browser របស់លោកអ្នករួចចូលទៅកាន់៖
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

### 🛡️ Pre-commit Secret Scanner (ការពារការ Commit សម្ងាត់)

គម្រោងមាន **Git Hook** ដែលពិនិត្យរាល់ការ Commit ដោយស្វ័យប្រវត្តិ និង **បដិសេធ** ការ Commit ប្រសិនបើរកឃើញ៖
- ឯកសារ `.env` ពិត (អនុញ្ញាតតែ `.env.example` ប៉ុណ្ណោះ)
- API Keys ដូចជា Groq (`gsk_...`), Google (`AQ....`, `AIza...`), OpenAI (`sk-...`)
- Tokens ដូចជា GitHub (`ghp_...`), Slack (`xox...`)
- Private Keys និងការកំណត់ Credential ត្រង់ៗក្នុងកូដ

**ការធ្វើឱ្យសកម្ម (ធ្វើតែម្ដងក្នុងមួយ Clone)៖**
```bash
npm run setup:hooks
```

បន្ទាប់ពីនេះ រាល់ `git commit` នឹងដំណើរការការពិនិត្យជាមុន៖
```text
[pre-commit] Scanning staged changes for secrets...
[pre-commit] No secrets detected. OK
```

> [!WARNING]
> ប្រសិនបើ Hook រារាំងការ Commit ដោយខុស (False Positive) សូមពិនិត្យបន្ទាត់ដែលបានរាយ ហើយលុបតម្លៃសម្ងាត់ចេញ ឬផ្លាស់វាទៅ `.env`។ ការបង្វែរ Hook (`git commit --no-verify`) **មិនត្រូវបានណែនាំទេ** លុះត្រាតែជាករណីអាសន្នពិតប្រាកដ។

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
