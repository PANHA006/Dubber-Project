const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const assert = require('assert');

async function runPostRemovalReview() {
  console.log('================================================================');
  console.log('   🔍 COMPREHENSIVE REVIEW & AUDIT: POST BUTTON REMOVAL & PIPELINE');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');
  const stateJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'state.js'), 'utf-8');
  const transcriberPy = fs.readFileSync(path.join(rootDir, 'src', 'workers', 'whisper_transcriber.py'), 'utf-8');
  const geminiServiceJs = fs.readFileSync(path.join(rootDir, 'src', 'services', 'gemini.service.js'), 'utf-8');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     ↳ ${e.message}`);
    }
  }

  // --- 1. AUDITING TIMELINE TOOLBAR PURGE & CORE ACTIONS ---
  console.log('--- 1. AUDITING TIMELINE TOOLBAR PURGE & CORE ACTIONS ---');

  test('Removed buttons/tags are completely absent from index.html', () => {
    assert(!indexHtml.includes('id="btn-autofit"'), '#btn-autofit must NOT exist in index.html');
    assert(!indexHtml.includes('toggleAutoFit()'), 'toggleAutoFit() must NOT exist in index.html');
    assert(!indexHtml.includes('syncTrackEnd()'), 'syncTrackEnd() must NOT exist in index.html');
    assert(!indexHtml.includes('Sync End'), '"Sync End" label must NOT exist in index.html');
    assert(!indexHtml.includes('ភាសាខ្មែរ (Khmer)'), 'Khmer language pill must NOT exist in Timeline header');
  });

  test('Core workflow buttons are present and properly ordered in Timeline Editor', () => {
    const transcribeIdx = indexHtml.indexOf('id="btn-transcribe"');
    const translateIdx = indexHtml.indexOf('id="btn-translate"');
    const generateVoiceIdx = indexHtml.indexOf('generateAllVoice()');

    assert(transcribeIdx !== -1, '#btn-transcribe exists');
    assert(translateIdx !== -1, '#btn-translate exists');
    assert(generateVoiceIdx !== -1, 'generateAllVoice button exists');
    assert(transcribeIdx < translateIdx, '#btn-transcribe comes before #btn-translate');
    assert(translateIdx < generateVoiceIdx, '#btn-translate comes before generateAllVoice');
  });

  // --- 2. AUDITING JAVASCRIPT STATE & CLEANUP ---
  console.log('\n--- 2. AUDITING JAVASCRIPT STATE & CLEANUP ---');

  test('main.js has no dead references to toggleAutoFit or syncTrackEnd', () => {
    assert(!mainJs.includes('toggleAutoFit'), 'main.js must not contain toggleAutoFit');
    assert(!mainJs.includes('syncTrackEnd'), 'main.js must not contain syncTrackEnd');
  });

  test('state.js has autoFit property cleanly removed', () => {
    assert(!stateJs.includes('autoFit:'), 'state.js must not contain autoFit property');
  });

  test('main.js properly exports startTranscription, startTranslation, generateAllAudio', () => {
    assert(mainJs.includes('startTranscription'), 'main.js contains startTranscription');
    assert(mainJs.includes('startTranslation'), 'main.js contains startTranslation');
    assert(mainJs.includes('generateAllAudio'), 'main.js contains generateAllAudio');
  });

  // --- 3. AUDITING PYTHON WORKER MERGE WITH " / " ---
  console.log('\n--- 3. AUDITING PYTHON WORKER MERGE WITH " / " ---');

  test('whisper_transcriber.py merges adjacent clauses with " / "', () => {
    assert(transcriberPy.includes('f"{curr_text} / {next_text}"'), 'whisper_transcriber.py delimits with " / "');
  });

  test('Python Worker merges Chinese segments with " / " in actual execution', () => {
    const pyScript = `
import sys, json
sys.path.insert(0, r'${path.join(rootDir, 'src', 'workers')}')
from whisper_transcriber import merge_fragmented_segments

segs = [
    {"id": 1, "startSec": 3.1, "endSec": 5.4, "text": "一个破坏改了十几遍"},
    {"id": 2, "startSec": 5.4, "endSec": 7.8, "text": "信留的我人你很久了"},
    {"id": 3, "startSec": 15.6, "endSec": 17.3, "text": "公司刚装的高清投影"}
]
res = merge_fragmented_segments(segs, max_gap=0.20, max_merge_count=3)
print(json.dumps([r["text"] for r in res]))
`;
    const pythonPath = 'D:\\Desktop\\create-dubber-project\\.venv\\Scripts\\python.exe';
    const pyExec = fs.existsSync(pythonPath) ? pythonPath : 'python';
    const res = spawnSync(pyExec, ['-c', pyScript], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    if (res.status !== 0) {
      throw new Error(`Python script execution failed: ${res.stderr}`);
    }
    const texts = JSON.parse(res.stdout.trim());
    assert.strictEqual(texts[0], '一个破坏改了十几遍 / 信留的我人你很久了', 'First segment must be delimited by " / "');
    assert.strictEqual(texts[1], '公司刚装的高清投影', 'Second segment must remain untouched');
  });

  test('gemini.service.js contains explicit instruction for " / " merged lines', () => {
    assert(geminiServiceJs.includes("If a line contains ' / '"), 'Gemini prompt includes instruction for " / "');
    assert(geminiServiceJs.includes("DO NOT output the slash '/' in your Khmer translation"), 'Instructs AI not to output literal slash');
  });

  // --- 4. AUDITING LIVE HTTP SERVER ---
  console.log('\n--- 4. AUDITING LIVE HTTP SERVER ---');

  const checkEndpoint = (urlPath) => {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: 'localhost', port: 5000, path: urlPath, timeout: 3000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`Endpoint ${urlPath} returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
    });
  };

  try {
    await checkEndpoint('/');
    console.log('  ✅ PASS: HTTP GET / (Frontend Studio UI) -> 200 OK');
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: HTTP GET / -> ${e.message}`);
  }
  total++;

  try {
    await checkEndpoint('/css/output.css');
    console.log('  ✅ PASS: HTTP GET /css/output.css (Compiled Tailwind v4) -> 200 OK');
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: HTTP GET /css/output.css -> ${e.message}`);
  }
  total++;

  try {
    await checkEndpoint('/api/health');
    console.log('  ✅ PASS: HTTP GET /api/health (Server & Python Worker Health) -> 200 OK');
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: HTTP GET /api/health -> ${e.message}`);
  }
  total++;

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passed}/${total} CHECKS PASSED (${Math.round((passed/total)*100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPostRemovalReview().catch(err => {
  console.error(err);
  process.exit(1);
});
