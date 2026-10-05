# 🎙️ Dubber Project - Architecture & Pipeline Flow

ឯកសារពិពណ៌នាលម្អិតអំពី **លំហូរការងារ (Pipeline Flow)** នៃប្រព័ន្ធបញ្ចូលសំឡេងស្វ័យប្រវត្តិ **AI Audio & Video Dubbing** ដោយប្រើប្រាស់ **Pure Node.js + FFmpeg**។

---

## 📊 ដ្យាក្រាមលំហូរការងារទាំងមូល (Architecture Flowchart)

```mermaid
flowchart TD
    A["🎬 វីដេអូដើម (Input Video)"] --> B["⚙️ ជំហាន ១: ទាញយកសំឡេង<br/><b>FFmpeg</b> (WAV 16kHz Mono)"]
    B --> C["📝 ជំហាន ២: បំប្លែងជាអក្សរ<br/><b>Faster-Whisper (Offline)</b><br/>(Text + Timestamps)"]
    C --> D["🌐 ជំហាន ៣: បកប្រែជាភាសាខ្មែរ<br/><b>Gemini Flash 2.5</b><br/>(2-Step Translation with Multi-Key Pool)"]
    D --> E["🖥️ <b>Web UI Interactive Data Table</b><br/><i>(អ្នកប្រើប្រាស់ពិនិត្យ & កែសម្រួលដោយផ្ទាល់)</i>"]
    
    E -->|ទិន្នន័យត្រឹមត្រូវ 100%| F["🗣️ ជំហាន ៤: បង្កើតសំឡេង AI<br/><b>Microsoft Edge TTS</b> (Khmer Voices)"]
    F --> G["🎛️ ជំហាន ៥: តម្រឹមល្បឿន & លាយសំឡេង<br/><b>FFmpeg Audio Filters</b> (atempo, adelay, amix)"]
    G --> H["🎞️ ជំហាន ៦: ផ្គុំវីដេអូ & Subtitles<br/><b>FFmpeg Muxer</b>"]
    H --> I["🎉 <b>វីដេអូសម្រេច (Final Output)</b><br/>រក្សាទុកក្នុង <code>storage/exports/</code> ឬ <code>storage/videos/</code>"]

    style E fill:#4f46e5,stroke:#312e81,stroke-width:2px,color:#fff
    style I fill:#059669,stroke:#064e3b,stroke-width:2px,color:#fff
    style A fill:#0f172a,stroke:#334155,stroke-width:2px,color:#fff
```

```text
[ វីដេអូដើម (Input Video) ]
            │
            ▼
[ ជំហាន ១: ទាញយកសំឡេង (Audio Extraction) ]
            │  └──► បច្ចេកវិទ្យា: FFmpeg (WAV 16kHz Mono)
            ▼
[ ជំហាន ២: បំប្លែងសំឡេងជាអក្សរ (Transcription) ]
            │  └──► បច្ចេកវិទ្យា: Faster-Whisper Offline Worker (Speech-to-Text + Word Timestamps)
            ▼
[ ជំហាន ៣: បកប្រែភាសា (2-Step Cinema Translation) ]
            │  └──► បច្ចេកវិទ្យា: Google Gemini Flash 2.5 (EN Context -> Spoken Cinema Khmer)
            │  └──► ប្រព័ន្ធ Multi-Key Failover Pool (Auto-rotation, Cooldown & Lockout)
            ▼
┌─────────────────────────────────────────────────────────────┐
│ ★ ការត្រួតពិនិត្យ និងកែសម្រួល (Review & Edit - Human-in-the-Loop)│
│    └──► បច្ចេកវិទ្យា: Interactive Data Table លើ Web UI      │
│         (កែពាក្យខុស, សារ៉េ Timestamps, ស្ដាប់ Audio តេស្ត)       │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
[ ជំហាន ៤: បង្កើតសំឡេង AI (Voice Synthesis) ]
            │  └──► បច្ចេកវិទ្យា: Microsoft Edge TTS (Piseth / Sreymom Neural)
            ▼
[ ជំហាន ៥: តម្រឹមល្បឿន និងលាយសំឡេង (Speed Align & Audio Mixing) ]
            │  └──► បច្ចេកវិទ្យា: FFmpeg Audio Filters (atempo, adelay, amix)
            ▼
[ ជំហាន ៦: ផ្គុំវីដេអូ និង Subtitles (Final Video Assembly) ]
            │  └──► បច្ចេកវិទ្យា: FFmpeg (Mux Audio + Burn-in Subtitles)
            ▼
[ វីដេអូសម្រេច (Final Dubbed & Subtitled Video) ]
            │
            └──► រក្សាទុកក្នុង: `storage/exports/` (ឬ `storage/videos/`) & បង្ហាញលើ Video Player
```

---

## 🛠️ ការវិភាគលម្អិតតាមជំហាននីមួយៗ (Step-by-Step Breakdown)

### ជំហាន ១៖ ទាញយកសំឡេង (Audio Extraction)
- **បច្ចេកវិទ្យា:** `FFmpeg`
- **គោលបំណង:** ទាញយកតែ Track សំឡេងចេញពីវីដេអូដើម។
- **ទិន្នន័យចូល (Input):** ឯកសារវីដេអូ (`.mp4`, `.mkv`, `.mov` ...)
- **ទិន្នន័យចេញ (Output):** `audio_extracted.wav` (16kHz Mono)
- **FFmpeg Command គំរូ:**
  ```bash
  ffmpeg -i input_video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio_extracted.wav
  ```

---

### ជំហាន ២៖ បំប្លែងសំឡេងជាអក្សរ (Transcription & Timestamps)
- **បច្ចេកវិទ្យា:** `Faster-Whisper (Python Offline Worker)`
- **គោលបំណង:** ស្តាប់សំឡេងដោយផ្ទាល់នៅលើម៉ាស៊ីន (Offline) និងបង្កើតជាឃ្លាអត្ថបទព្រមទាំងម៉ោងកំណត់ (Start Time, End Time) កម្រិតពាក្យ (Word-level timestamps) ដោយមិនចំណាយ Quota API។
- **ទិន្នន័យចេញ (Output JSON Example):**
  ```json
  [
    {
      "id": 1,
      "start": 0.5,
      "end": 3.2,
      "text": "Hello and welcome back to our channel."
    },
    {
      "id": 2,
      "start": 3.5,
      "end": 6.8,
      "text": "Today we will talk about artificial intelligence."
    }
  ]
  ```

---

### ជំហាន ៣៖ បកប្រែជាភាសាខ្មែរ (2-Step Cinema Translation)
- **បច្ចេកវិទ្យា:** `Google Gemini Flash 2.5` ជាមួយ **Multi-Key Failover Pool**
- **គោលបំណង:** បកប្រែ ២ ដំណាក់កាល (Chinese/Source -> Intermediate English Context -> Natural Spoken Cinema Khmer) ដោយធានាឃ្លាសន្ទនារលូនបែបបញ្ចូលសំឡេងរឿង និងបង្វិល API Key ដោយស្វ័យប្រវត្តិនៅពេលប៉ះ Quota Limit (429/ResourceExhausted)។
- **ទិន្នន័យចេញ (Output JSON Example):**
  ```json
  [
    {
      "id": 1,
      "start": 0.5,
      "end": 3.2,
      "text": "Hello and welcome back to our channel.",
      "englishText": "Hello and welcome back to our channel.",
      "khmerText": "សួស្តីបងប្អូនទាំងអស់គ្នា សូមស្វាគមន៍មកកាន់ឆានែលយើងខ្ញុំឡើងវិញ។"
    }
  ]
  ```

---

### ★ ចំណុចគន្លឹះ៖ ការត្រួតពិនិត្យ និងកែសម្រួល (Review & Edit - Human-in-the-Loop)
- **បច្ចេកវិទ្យា:** `Web UI (HTML5 + Tailwind CSS + Vanilla JS)`
- **គោលបំណង:** 
  - បង្ហាញទិន្នន័យទាំងអស់លើ Interactive Data Table
  - អនុញ្ញាតឱ្យអ្នកប្រើប្រាស់កែសម្រួលអក្ខរាវិរុទ្ធខ្មែរ
  - សារ៉េកែប្រែម៉ោង Start / End time ឱ្យត្រូវនឹងកាយវិការមាត់ (Lip Sync)
  - ធានាភាពត្រឹមត្រូវ ១០០% មុននឹងបញ្ជូនទៅបង្កើតសំឡេង AI។

---

### ជំហាន ៤៖ បង្កើតសំឡេង AI (Voice Synthesis & Character Cloning)
- **បច្ចេកវិទ្យា:** 
  1. `Microsoft Edge TTS` (Free & High Quality Neural Voices) សម្រាប់បញ្ចេញសំឡេងខ្មែរត្រូវខ្នាត ១០០%។
  2. `RVC v2 (Retrieval-based Voice Conversion)` Local AI (CPU Mode) សម្រាប់បំប្លែងក្រឡាសំឡេង (Timbre/Tone) ទៅជាសំឡេងតួអង្គភាពយន្ត ឬតុក្កតា។
- **សំឡេងដែលគាំទ្រ:**
  - **Default Voices:** `km-KH-PisethNeural` (សំឡេងបុរស), `km-KH-SreymomNeural` (សំឡេងស្ត្រី)
  - **Custom Cloned Voices:** គាំទ្ររាល់ Model `.pth` និង `.index` ទាំងអស់ដែល Upload តាមរយៈ Web UI Voice Library
- **ទិន្នន័យចេញ:** ឯកសារសំឡេង `.mp3` ដាច់ដោយឡែកសម្រាប់ឃ្លានីមួយៗ (`voice_sub_xxx.mp3`) រក្សាទុកក្នុង `storage/voices/`

---

### ជំហាន ៥៖ តម្រឹមល្បឿន និងលាយសំឡេង (Speed Align & Audio Mixing)
- **បច្ចេកវិទ្យា:** `FFmpeg Audio Filters` (`atempo`, `adelay`, `amix`)
- **គោលបំណង:** 
  - គណនាប្រវែងសំឡេង AI ប្រៀបធៀបនឹងប្រវែងវីដេអូដើម
  - ប្រសិនបើសំឡេងខ្មែរវែងជាង ត្រូវបង្កើនល្បឿន (`atempo=X.XX`) ដោយមិនឱ្យបាត់បង់ Pitch សំឡេង
  - ពន្យារពេល (`adelay`) ឱ្យសំឡេងនីមួយៗបន្លឺឡើងត្រូវនឹងវិនាទីដែលបានកំណត់
  - លាយ (Mix) សំឡេង AI ជាមួយភ្លេងកំដរដើម (Background Music)។
- **FFmpeg Filter Command គំរូ:**
  ```bash
  # បង្កើនល្បឿនសំឡេង ១.១៥x ដោយរក្សា pitch
  ffmpeg -i segment_001.mp3 -filter:a "atempo=1.15" segment_001_aligned.mp3
  ```

---

### ជំហាន ៦៖ ផ្គុំវីដេអូ និង Subtitles (Final Video Assembly)
- **បច្ចេកវិទ្យា:** `FFmpeg Muxer`
- **គោលបំណង:**
  - បញ្ចូលសំឡេងដែលបាន Mix រួចទៅក្នុងវីដេអូដើម
  - បង្កប់ Subtitles (Hardsub ឬ Soft Subtitle SRT/VTT)
  - Export ចេញជាវីដេអូសម្រេចគុណភាពខ្ពស់ (`.mp4`)។
- **FFmpeg Command គំរូ:**
  ```bash
  ffmpeg -i input_video.mp4 -i final_dubbed_audio.wav -c:v copy -map 0:v:0 -map 1:a:0 storage/exports/final_dubbed_video.mp4
  ```

---

## 🏆 ស្ថាបត្យកម្មប្រព័ន្ធ (System Architecture & Pipeline Integration)

1. **ការបំបែកការងារច្បាស់លាស់ (Decoupled Services):** Node.js/Express ទទួលខុសត្រូវលើ API, State Management, និង Web UI ចំណែក Python Worker ទទួលខុសត្រូវលើ Offline AI Inference (Faster-Whisper និង Edge-TTS)។
2. **Offline-First Transcription:** ប្រើ Faster-Whisper ដោយផ្ទាល់លើ GPU/CPU Local មិនចាំបាច់ផ្ញើសំឡេងទំហំធំទៅ Cloud API និងមិនបារម្ភរឿងអស់ Quota។
3. **Resilient AI Translation:** Google Gemini Flash 2.5 ដំណើរការជាមួយ Key Manager Failover Pool ដែលបង្វិល Key ស្វ័យប្រវត្តិពេលជួប Rate Limit ឬ Quota Lockout។
4. **ល្បឿនលឿន និងគុណភាពសំឡេងខ្ពស់:** `atempo` និង Audio Filters របស់ FFmpeg ដំណើរការ Time-stretching បានល្អឥតខ្ចោះ មិនធ្វើឱ្យសំឡេងស្រួច (No chipmunk effect)។
5. **Storage Architecture ស្តង់ដារ:** រក្សាទុកឯកសារតាម Folder ច្បាស់លាស់ក្នុង `storage/` (`storage/temp/`, `storage/voices/`, `storage/videos/`, `storage/exports/`, `storage/projects/`)។
