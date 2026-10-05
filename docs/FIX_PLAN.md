# ផែនការជួសជុល — Dubber Project (Fix Plan)

> **កាលបរិច្ឆេទ:** 2026-10-05
> **ស្ថានភាពបច្ចុប្បន្ន:** Server ✅ ដំណើរការល្អ (PID 24016, port 5000), 6/6 Gemini keys READY, Python venv ✅, API ✅
> **សេចក្ដីសង្ខេប:** គ្មាន bug ធ្ងន់ធ្ងរទេ។ បញ្ហាចម្បងគឺ **hygiene នៃ Git repo** និង **ឯកសារមិនស៊ីគ្នា (doc drift)** ។

---

## 🏁 ស្ថានភាពអនុវត្ត — បញ្ចប់ទាំង ៣ ដំណាក់កាល ✅

| ដំណាក់កាល | ស្ថានភាព | Commits |
|---|---|---|
| **Phase 1 — Git Hygiene** | ✅ បញ្ចប់ | `501ca46`, `c290a2d`, `04da71f`, `958f729`, `fd3c6ce`, `7aee3d1`, `de996dd` |
| **Phase 2 — Doc Drift** | ✅ បញ្ចប់ | `e8ddb0f` |
| **Phase 3 — Security & Robustness** | ✅ បញ្ចប់ | `485da18`, `993524d` |

**លទ្ធផល:** Working tree ស្អាតទាំងស្រុង • Test suite 33 e2e + 6 regression PASS ✅ • Server healthy ✅

**ការរកឃើញបន្ថែមក្រោយស្កេន:** `.env` មិនដែល commit (safe)၊ `storage/**/.gitkeep` មានរួចហើយ ៧ ឯកសារ, Gemini model drift (`Flash 2.5` → `gemini-3.5-flash-lite`), និង 5 hardcoded paths ក្នុង `scripts/translate_khmer_subtitles.js`។

---

## 📊 ការវាយតម្លៃស្ថានភាពជាក់ស្តែង (Verified Facts)

| ចំណុច | ស្ថានភាពពិត | កម្រិតគ្រោះថ្នាក់ |
|---|---|---|
| `.env` ត្រូវ commit ចូល git? | ❌ **មិនត្រូវទេ** — `.gitignore:32` គ្របដណ្តប់រួចហើយ | ~~P0~~ → ✅ គ្មានបញ្ហា |
| Secrets leak ក្នុង tracked files? | ❌ គ្មាន (git grep រកមិនឃើញ) | ✅ គ្មានបញ្ហា |
| `storage/` ត្រូវ track? | ❌ ទទេ (0 files tracked) | ✅ គ្មានបញ្ហា |
| Uncommitted changes | ⚠️ **26 modified + 87 untracked = 6433 insertions** | **P1 — ខ្ពស់** |
| `README.md` PYTHON_PATH | ⚠️ ចង្អុលទៅ `create-dubber-project/.venv` (folder ចាស់) | **P2 — មធ្យម** |
| `.gitkeep` ក្នុង `storage/` | ⚠️ គ្មានសោះ (ទោះ `.gitignore` rule ចង់រក្សា skeleton) | **P2 — មធ្យម** |
| `UI.example.html` | ⚠️ ត្រូវលុប (D) ដោយមិនទាន់ commit | **P3 — ទាប** |
| `package-lock.json` untracked | ⚠️ គួរ commit ដើម្បី reproducible build | **P2 — មធ្យម** |

---

## 🎯 ផែនការជួសជុលតាមដំណាក់កាល

### Phase 1 — Git Repo Hygiene (អាទិភាពខ្ពស់)
**គោលដៅ:** ធ្វើឱ្យ working tree ស្អាត, គ្មានហានិភ័យបាត់ការងារ, commit បានត្រឹមត្រូវ។

| # | សកម្មភាព | ពាក្យបញ្ជា / វិធី | ហានិភ័យ |
|---|---|---|---|
| 1.1 | Backup សុវត្ថិភាពមុនគេ | `git stash list` និង copy folder ទាំងមូលទៅ `Dubber Project_backup_2026-10-05/` | គ្មាន |
| 1.2 | ពិនិត្យ diff លម្អិតមុន commit | `git diff --stat` → ពិនិត្យឯកសារម្តងមួយៗដែលប្រែប្រួល | គ្មាន |
| 1.3 | Commit ក្រុមទី១ — Backend services ថ្មី | `git add src/services/ src/workers/` → commit `feat: add multi-provider STT, TTS, RVC and video renderer services` | ទាប |
| 1.4 | Commit ក្រុមទី២ — Frontend changes | `git add public/` → commit `feat: update frontend modules and UI` | ទាប |
| 1.5 | Commit ក្រុមទី៣ — Tests | `git add tests/` → commit `test: add comprehensive pipeline test suite` | ទាប |
| 1.6 | Commit ក្រុមទី៤ — Docs + config | `git add README.md PIPELINE_FLOW.md .env.example package.json package-lock.json .gitignore` | ទាប |
| 1.7 | Commit ក្រុមទី៥ — Scripts | `git add scripts/` → commit `chore: add batch translation scripts` | ទាប |
| 1.8 | Commit ការលុប `UI.example.html` | រួមក្នុងក្រុមទី២ ឬ commit ដោយឡែក | ទាប |
| 1.9 | ផ្ទៀងផ្ទាត់ចុងក្រោយ | `git status` ត្រូវទទេ (លើកលែង `.env`, `.key-status.json`, `storage/`) | គ្មាន |

**⚠️ ចំណាំ:** មុន `git add .` ត្រូវប្រាកដថា `.env` មិនចូល — ព្រោះ `.gitignore` មាន `!.env.example` exception ដែលអាចធ្វើឱ្យស្មានខុស។ ប្រើ `git add <specific-paths>` ជាជាង `git add .`

---

### Phase 2 — ជួសជុលឯកសារមិនស៊ីគ្នា (Doc Drift)
**គោលដៅ:** README និង config ត្រូវត្រូវនឹងការពិត។

| # | បញ្ហា | ទីតាំង | ដំណោះស្រាយ |
|---|---|---|---|
| 2.1 | `PYTHON_PATH` ចង្អុលទៅ folder ចាស់ `create-dubber-project` | `README.md:223` | កែជា `D:\Desktop\Dubber Project\.venv\Scripts\python.exe` (ត្រូវបង្កើត local venv ជាមុន ឬកែជា relative) |
| 2.2 | `.env` ប្រើ absolute path ចងភ្ជាប់ម៉ាស៊ីនតែមួយ | `.env:36` | ពិចារណាបង្កើត `.venv` ក្នុង project ដើម្បី auto-detect (config គាំទ្ររួចហើយ) |
| 2.3 | `storage/` គ្មាន `.gitkeep` | `storage/*/` | បង្កើត `.gitkeep` ក្នុង `temp/`, `voices/`, `videos/`, `exports/`, `projects/`, `history/`, `rvc_models/` ដើម្បីរក្សា skeleton |
| 2.4 | README ខ្វះព័ត៌មាន deepgram/groq provider | `README.md` | បន្ថែមផ្នែក "STT Providers" ពន្យល់ 3 providers + របៀបជ្រើស |
| 2.5 | `.env.example` ខ្វះ `GEMINI_TRANSLATION_MODEL`, `GEMINI_DAILY_QUOTA_PER_KEY` | `.env.example` | បន្ថែមឱ្យត្រូវនឹង `.env` ពិត (ត្រូវ check diff) |

---

### Phase 3 — ការកែលម្អសុវត្ថិភាព និងភាពរឹងមាំ
**គោលដៅ:** បង្ការបញ្ហាអនាគត។

| # | សកម្មភាព | ហេតុផល |
|---|---|---|
| 3.1 | បន្ថែម pre-commit hook ពិនិត្យ secret | ការពារការ commit `.env` ដោយចៃដន្យក្នុងអនាគត |
| 3.2 | បង្កើត `storage/**/.gitkeep` និងផ្ទៀងផ្ទាត់ `.gitignore` rule | ធានាថា `!storage/**/` exception ដំណើរការត្រឹមត្រូវ |
| 3.3 | ពិនិត្យ absolute paths ផ្សេងទៀតក្នុង code | កាត់បន្ថយបញ្ហា portability |
| 3.4 | ដំណើរការ test suite ពេញលេញ | `npm run test:all` — ផ្ទៀងផ្ទាត់គ្មាន regression មុន commit ចុងក្រោយ |

---

## 🔧 ផែនការបញ្ជាក់លម្អិត — Phase 1 (ជំហានជាក់ស្តែង)

បើអ្នកយល់ព្រម ខ្ញុំនឹងអនុវត្តតាមលំដាប់នេះ៖

```bash
# ជំហាន 0: Backup
cp -r "D:/Desktop/Dubber Project" "D:/Desktop/Dubber Project_backup_2026-10-05"

# ជំហាន 1: ផ្ទៀងផ្ទាត់ .env មិនចូល
git check-ignore -v .env          # ត្រូវតែបង្ហាញ .gitignore:32

# ជំហាន 2: Commit backend services ថ្មី (8 files)
git add src/services/deepgram.service.js src/services/groq.service.js \
        src/services/history.service.js src/services/pcm-muter.service.js \
        src/services/rvc.service.js src/services/tts.service.js \
        src/services/video-renderer.service.js src/services/whisper.service.js \
        src/workers/
git commit -m "feat: add multi-provider STT, TTS, RVC and video renderer services"

# ជំហាន 3: Commit frontend
git add public/
git commit -m "feat: update frontend modules, timeline and subtitle handling"

# ជំហាន 4: Commit tests
git add tests/
git commit -m "test: add comprehensive dubbing pipeline test suite"

# ជំហាន 5: Commit docs + config
git add README.md PIPELINE_FLOW.md .env.example .gitignore package.json package-lock.json
git commit -m "docs: refresh pipeline docs and environment template"

# ជំហាន 6: Commit scripts
git add scripts/
git commit -m "chore: add offline batch translation scripts"

# ជំហាន 7: ផ្ទៀងផ្ទាត់
git status
```

**លទ្ធផលរំពឹងទុក:** `git status` ទទេ លើកលែង `.env`, `.key-status.json`, `storage/` (ដែលត្រូវ ignore)។

---

## ❓ ចំណុចត្រូវសម្រេចចិត្ត

សូមជ្រើសរើសជម្រើសខាងក្រោម ដើម្បីខ្ញុំអនុវត្តបានត្រឹមត្រូវ៖

1. **វិសាលភាព:** ធ្វើតែ Phase 1 (git hygiene) ឬធ្វើគ្រប់ Phase 1–3?
2. **លំដាប់ commit:** ចង់ commit ដាច់ដោយឡែកតាមក្រុម (5 commits ស្អាត) ឬចង់ commit តែមួយ (`feat: complete dubbing pipeline implementation`) ?
3. **`PYTHON_PATH`:** ចង់ឱ្យខ្ញុំបង្កើត `.venv` ក្នុង project (ត្រូវការ pip install ឡើងវិញ ~2-3 នាទី) ឬកែ README ឱ្យត្រូវនឹង path បច្ចុប្បន្ន?
4. **Backup:** ចង់ copy folder ទាំងមូល (ប្រហែល 1-2 GB ដោយសារ storage/) ឬគ្រាន់តែ `git stash` ?

---

## 📝 សេចក្ដីសង្ខេប

ការស្កេនបានបង្ហាញថា **គម្រោងនេះសុខភាពល្អ** — server ដំណើរការ, API ឆ្លើយតប, keys ទាំង 6 READY, Python workers ដំណើរការ។ បញ្ហាធ្ងន់ធ្ងរដែលខ្ញុំសង្ស័យមុននេះ (secrets leak) **បានបញ្ជាក់ថាមិនមាន** — `.gitignore` គ្របដណ្តប់បានល្អ។

អ្វីដែលត្រូវធ្វើគឺ **ការសម្អាត Git** (6433 insertions មិនទាន់ commit) និង **កែឯកសារឱ្យស៊ីគ្នា** — ជាការងារថែទាំ មិនមែនបញ្ហាប្រព័ន្ធទេ។
