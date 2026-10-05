const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const gemini = require('../src/services/gemini.service');

/**
 * Working directory that holds the input bilingual subtitle file and where the
 * translated outputs are written.
 *
 * Resolution order (first match wins):
 *   1. --dir=<path>          command-line argument
 *   2. SUBTITLE_DIR          environment variable (.env)
 *   3. ./subtitle_data       project-local default
 */
function resolveWorkDir() {
  const argDir = process.argv.find((a) => a.startsWith('--dir='));
  if (argDir) return path.resolve(argDir.slice('--dir='.length));
  if (process.env.SUBTITLE_DIR) return path.resolve(process.env.SUBTITLE_DIR);
  return path.join(__dirname, '..', 'subtitle_data');
}

const WORK_DIR = resolveWorkDir();
const IN_FILE = path.join(WORK_DIR, process.env.SUBTITLE_INPUT || 'subtitle_bilingual.txt');

function parseTimestampToSec(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(ts) || 0;
}

function secToSRT(sec) {
  const hrs = Math.floor(sec / 3600);
  const rem = sec % 3600;
  const mins = Math.floor(rem / 60);
  const secs = rem % 60;
  const s = Math.floor(secs);
  const ms = Math.round((secs - s) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function run() {
  console.log('--- Loading Subtitle Files ---');
  console.log(`Working dir: ${WORK_DIR}`);
  const biFile = IN_FILE;
  if (!fs.existsSync(biFile)) {
    throw new Error(
      `Input file not found: ${biFile}\n` +
      'Pass a folder with --dir=<path>, set SUBTITLE_DIR in .env, ' +
      'or place "subtitle_bilingual.txt" inside ./subtitle_data.'
    );
  }
  const rawBi = fs.readFileSync(biFile, 'utf8').split('\n').filter(l => l.trim().length > 0);
  
  const subtitles = [];
  for (let i = 1; i < rawBi.length; i++) {
    const parts = rawBi[i].split('|');
    if (parts.length >= 5) {
      const id = parts[0].trim();
      const start = parts[1].trim();
      const end = parts[2].trim();
      const zh = parts[3].trim();
      const en = parts.slice(4).join('|').trim();
      const sSec = parseTimestampToSec(start);
      const eSec = parseTimestampToSec(end);
      const dur = Math.max(0.5, Math.round((eSec - sSec) * 100) / 100);
      subtitles.push({ id, start, end, sSec, eSec, dur, zh, en });
    }
  }

  console.log(`Loaded ${subtitles.length} subtitle items.`);

  const cacheFile = path.join(WORK_DIR, 'translated_cache.json');
  let cache = {};
  if (fs.existsSync(cacheFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log(`Found existing cache with ${Object.keys(cache).length} translated items.`);
    } catch (_) {
      cache = {};
    }
  }

  const BATCH_SIZE = 40;
  for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
    const batch = subtitles.slice(i, i + BATCH_SIZE);
    
    // Check if all in batch already in cache
    const missing = batch.filter(item => !cache[item.id] || !cache[item.id].khmerText);
    if (missing.length === 0) {
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, subtitles.length)}) already cached.`);
      continue;
    }

    console.log(`\nTranslating Batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, subtitles.length)}): ${missing.length} items to translate...`);

    const promptLines = batch.map((item, idx) => {
      const maxWords = Math.max(3, Math.round(item.dur * 3.2));
      return `${item.id}|[Dur: ${item.dur}s, MaxWords: ~${maxWords}] EN: ${item.en} | ZH: ${item.zh}`;
    }).join('\n');

    const prompt = `You are an elite Cambodian film dubbing scriptwriter and translation master (អ្នកនិពន្ធនិងបកប្រែស្គ្រីបបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព បែបរឿងហូលីវូដ និងរឿងភាគ).
Translate and adapt each subtitle line into natural, idiomatic, spoken conversational Khmer (ភាសានិយាយសម្រាយរឿង/បញ្ចូលសំឡេងភាពយន្ត).

CRITICAL CINEMA DUBBING & TIMING RULES:
1. HUMAN SPOKEN DIALOGUE (ភាសានិយាយធម្មជាតិ):
   - Translate like natural voice actors speaking in movie dubbing (សម្រាយរឿង / បញ្ចូលសំឡេង)!
   - Use natural spoken particles and words: «ឯង, ខ្ញុំ, គាត់, លោក Gu, នាង, អាតឿ, ម៉េចចឹង, ត្រូវហើយ, ចាសៗ, បាទៗ, អើ, ហ្អី, មែនទេ, ចង់ងាប់ហើយហ្អី...».
   - NEVER use robotic, literal word-by-word Google Translate phrasing.

2. FIT DURATION STRICTLY (ខ្លីល្មម fit with time start and end):
   - Follow the duration [Dur: Xs, MaxWords: ~Y] budget.
   - If Dur < 1.5s: Ultra-short, punchy (2 - 4 words maximum).
   - If Dur 1.5s - 2.5s: Concise (4 - 7 words).
   - If Dur > 2.5s: Flowing, smooth dialogue (7 - 12 words).
   - Keep it short and punchy so the speaker can finish comfortably within the timeframe!

3. ABSOLUTE PROHIBITION ON "ចាស់ៗ" (ANTI-HALLUCINATION GUARD):
   - "Right, right, right" / "Yes" / "Yeah" / "Sure" -> «បាទៗ», «ចាសៗ», «ត្រូវហើយ», or «អើៗ».
   - NEVER output «ចាស់ៗ» (which means old people)!

4. DIALOGUE TURNS WITH '/':
   - If English has '/', it means two people talking back-and-forth. Keep '/' in Khmer to separate the two speakers (e.g. "What did you say?! / I told the truth! -> ឯងនិយាយស្អីខ្លះ?! / ខ្ញុំប្រាប់ការណ៍ពិតតើ!").

5. CONTEXT & CHARACTERS:
   - Male Lead: Gu Chengchuan (Mr. Gu / 顾总) - wealthy CEO, dominant but deeply cares for Zhu Yu.
   - Female Lead: Zhu Yu (小朱 / Xiao Zhu) - witty employee who invented a fake abusive husband to keep people away; has a cat named Da Bao.
   - Sister Zhao (赵姐) - gossipy colleague who exaggerated Zhu Yu's situation to Mr. Gu.
   - Da Bao (大宝) - the pet cat.

OUTPUT FORMAT:
Return strictly a valid JSON object mapping string subtitle ID to an object with "khmerText".
Example:
{
  "0": { "khmerText": "បើកផ្នែកការពារសិទ្ធិស្ត្រីក្នុងក្រុមហ៊ុនមែនហ្អី?" },
  "3": { "khmerText": "ក្រុមហ៊ុនយើងចេះធ្វើសប្បុរសធម៌ពីអង្កាល់? លោក Gu ចិត្តធម៌ដល់ហើយ!" }
}

Lines to translate:
${promptLines}`;

    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      attempts++;
      try {
        const rawJson = await gemini.executeWithFailover(prompt, null, `TRANSLATE:BATCH_${Math.floor(i / BATCH_SIZE) + 1}`);
        let parsed = {};
        try {
          let clean = rawJson.trim();
          if (clean.startsWith('```json')) clean = clean.slice(7);
          if (clean.startsWith('```')) clean = clean.slice(3);
          if (clean.endsWith('```')) clean = clean.slice(0, -3);
          parsed = JSON.parse(clean.trim());
        } catch (_) {
          const match = rawJson.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        let gotCount = 0;
        for (const item of batch) {
          const res = parsed[item.id];
          if (res) {
            const txt = (typeof res === 'object' ? res.khmerText : res) || '';
            if (txt.trim()) {
              cache[item.id] = {
                id: item.id,
                start: item.start,
                end: item.end,
                sSec: item.sSec,
                eSec: item.eSec,
                zh: item.zh,
                en: item.en,
                khmerText: txt.trim()
              };
              gotCount++;
            }
          }
        }

        console.log(`  -> Translated and stored ${gotCount}/${batch.length} items in batch.`);
        fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
        success = true;
      } catch (err) {
        console.error(`  Batch error (attempt ${attempts}):`, err.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  console.log('\n--- Checking Final Results ---');
  let missingTotal = 0;
  for (const item of subtitles) {
    if (!cache[item.id] || !cache[item.id].khmerText) {
      missingTotal++;
    } else {
      // Clean any accidental Chinese characters
      cache[item.id].khmerText = cache[item.id].khmerText
        .replace(/赵/g, 'Zhao')
        .replace(/曹操/g, 'ឆាវឆាវ')
        .replace(/燈泡\s*\(ខ្សែកាប\)/g, 'អំពូលភ្លើងរំខានគេ');
    }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`Missing items: ${missingTotal} / ${subtitles.length}`);

  // Write Output Files
  console.log('\n--- Writing Output Files ---');

  // 1. subtitle_khmer.txt: ID|START|END|ORIG (where ORIG is Khmer)
  const khmerTxtPath = path.join(WORK_DIR, 'subtitle_khmer.txt');
  const khmerTxtLines = ['ID|START|END|ORIG'];
  for (const item of subtitles) {
    const kh = cache[item.id]?.khmerText || item.en;
    khmerTxtLines.push(`${item.id}|${item.start}|${item.end}|${kh}`);
  }
  fs.writeFileSync(khmerTxtPath, khmerTxtLines.join('\n'), 'utf8');
  console.log(`✅ Saved: ${khmerTxtPath}`);

  // 2. subtitle_bilingual_khmer.txt: ID|START|END|ORIG|TRANS
  const biKhmerPath = path.join(WORK_DIR, 'subtitle_bilingual_khmer.txt');
  const biKhmerLines = ['ID|START|END|ORIG|TRANS'];
  for (const item of subtitles) {
    const kh = cache[item.id]?.khmerText || item.en;
    biKhmerLines.push(`${item.id}|${item.start}|${item.end}|${item.en}|${kh}`);
  }
  fs.writeFileSync(biKhmerPath, biKhmerLines.join('\n'), 'utf8');
  console.log(`✅ Saved: ${biKhmerPath}`);

  // 3. subtitle_khmer.srt: Standard SubRip SRT
  const srtPath = path.join(WORK_DIR, 'subtitle_khmer.srt');
  const srtBlocks = [];
  let srtIdx = 1;
  for (const item of subtitles) {
    const kh = cache[item.id]?.khmerText || item.en;
    const startSrt = secToSRT(item.sSec);
    const endSrt = secToSRT(item.eSec);
    srtBlocks.push(`${srtIdx}\n${startSrt} --> ${endSrt}\n${kh}\n`);
    srtIdx++;
  }
  fs.writeFileSync(srtPath, srtBlocks.join('\n'), 'utf8');
  console.log(`✅ Saved: ${srtPath}`);

  console.log(`\n🎉 ALL DONE! ${subtitles.length} subtitles translated and exported to ${WORK_DIR}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
});
