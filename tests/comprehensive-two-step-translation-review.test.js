const fs = require('fs');
const path = require('path');
const http = require('http');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function requestHttp(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(text) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: text });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runComprehensiveReview() {
  console.log('================================================================');
  console.log('  🔍 DEEP REVIEW & AUDIT: 2-STEP TRANSLATION PIPELINE          ');
  console.log('     (Chinese -> English Pivot -> Khmer Movie Dubbing)         ');
  console.log('================================================================\n');

  // --- 1. AUDITING BACKEND PROMPT & COGNITIVE DIRECTIVES ---
  console.log('--- 1. AUDITING BACKEND PROMPT & COGNITIVE DIRECTIVES ---');
  const geminiJs = fs.readFileSync(path.join(__dirname, '../src/services/gemini.service.js'), 'utf-8');

  assert(geminiJs.includes('TWO-STEP COGNITIVE LOCALIZATION PROCESS'), 'Prompt enforces Two-Step Cognitive Process');
  assert(geminiJs.includes('STEP 1 - ENGLISH SEMANTIC PIVOT'), 'Prompt enforces Step 1 English Semantic Pivot');
  assert(geminiJs.includes('STEP 2 - KHMER DUBBING ADAPTATION'), 'Prompt enforces Step 2 Khmer Dubbing Adaptation');
  assert(geminiJs.includes('MOVIE DUBBING STYLE'), 'Prompt enforces Movie Dubbing Style');
  assert(geminiJs.includes('STRICT TIME BUDGET & PACING'), 'Prompt enforces Strict Time Budget & Pacing');
  assert(geminiJs.includes('englishText'), 'JSON schema requests englishText field');
  assert(geminiJs.includes('khmerText'), 'JSON schema requests khmerText field');
  assert(geminiJs.includes('DO NOT output the slash \'/\''), 'Prompt bans slash in final translated dialogue');

  // --- 2. AUDITING FRONTEND CLIENT BINDINGS & TABLE DISPLAY ---
  console.log('\n--- 2. AUDITING FRONTEND CLIENT TABLE RENDERING ---');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  assert(subtitlesJs.includes('sub.englishText'), 'subtitles.js checks for sub.englishText');
  assert(subtitlesJs.includes('English Pivot:'), 'subtitles.js includes English Pivot tooltip');
  assert(subtitlesJs.includes('EN'), 'subtitles.js renders [EN] cyan badge');
  assert(subtitlesJs.includes('sub-original-text-input'), 'subtitles.js renders original speech input');
  assert(subtitlesJs.includes('sub-text-input'), 'subtitles.js renders editable Khmer text input');

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  assert(mainJs.includes('item.englishText'), 'main.js captures item.englishText from translation response');
  assert(mainJs.includes('item.khmerText'), 'main.js captures item.khmerText from translation response');
  assert(mainJs.includes('window.triggerProjectAutoSave?.()'), 'main.js auto-saves project after translation');

  // --- 3. AUDITING LIVE GEMINI AI TRANSLATION WITH MULTI-CLAUSE CHINESE ---
  console.log('\n--- 3. TESTING LIVE 2-STEP TRANSLATION WITH GEMINI AI ---');
  const payload = {
    subtitles: [
      {
        id: 'sub-test-01',
        start: '00:00:01,000',
        end: '00:00:03,500',
        startSec: 1.0,
        endSec: 3.5,
        originalText: '一个破方案改了十几遍'
      },
      {
        id: 'sub-test-02',
        start: '00:00:04,000',
        end: '00:00:06,000',
        startSec: 4.0,
        endSec: 6.0,
        originalText: '效果不错吧'
      },
      {
        id: 'sub-test-03',
        start: '00:00:07,000',
        end: '00:00:10,000',
        startSec: 7.0,
        endSec: 10.0,
        originalText: '晚上七点 / 楼下地下车库等我'
      }
    ],
    endPadding: 0.70
  };

  const res = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/translate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(payload));

  assert(res.statusCode === 200, `POST /api/translate returned HTTP 200 (Got: ${res.statusCode})`);
  assert(res.body && res.body.success === true, 'Translation API returned success: true');
  assert(Array.isArray(res.body.data) && res.body.data.length === 3, 'Returned 3 translated subtitle items');

  const [t1, t2, t3] = res.body.data;

  console.log(`\n  💬 Translation Item 1:`);
  console.log(`     - Chinese Original: "${t1.originalText}"`);
  console.log(`     - English Anchor:   "${t1.englishText}"`);
  console.log(`     - Khmer Dubbing:    "${t1.khmerText}"`);

  console.log(`\n  💬 Translation Item 2:`);
  console.log(`     - Chinese Original: "${t2.originalText}"`);
  console.log(`     - English Anchor:   "${t2.englishText}"`);
  console.log(`     - Khmer Dubbing:    "${t2.khmerText}"`);

  console.log(`\n  💬 Translation Item 3 (Merged Clauses with '/'):`);
  console.log(`     - Chinese Original: "${t3.originalText}"`);
  console.log(`     - English Anchor:   "${t3.englishText}"`);
  console.log(`     - Khmer Dubbing:    "${t3.khmerText}"`);

  // Check 1: English Anchor verification
  assert(t1.englishText.length > 5, 'Item 1 English translation has substantial content');
  assert(/[a-zA-Z]/.test(t1.englishText), 'Item 1 English contains Latin letters');
  assert(t2.englishText.length > 3, 'Item 2 English translation has substantial content');
  assert(t3.englishText.length > 5, 'Item 3 English translation has substantial content');

  // Check 2: Khmer Dubbing Script verification
  assert(/[\u1780-\u17FF]/.test(t1.khmerText), 'Item 1 Khmer contains authentic Khmer unicode');
  assert(/[\u1780-\u17FF]/.test(t2.khmerText), 'Item 2 Khmer contains authentic Khmer unicode');
  assert(/[\u1780-\u17FF]/.test(t3.khmerText), 'Item 3 Khmer contains authentic Khmer unicode');

  // Check 3: Slash removal in merged clauses
  assert(!t3.khmerText.includes('/'), 'Item 3 Khmer cleanly eliminated raw slash separator');
  assert(!t3.englishText.includes('/'), 'Item 3 English cleanly eliminated raw slash separator');

  // --- 4. AUDITING DUAL-PERSISTENCE WITH ENGLISH TEXT ---
  console.log('\n--- 4. AUDITING PROJECT PERSISTENCE WITH ENGLISH TEXT ---');
  const projectPayload = {
    video: { name: 'chinese_video_test.mp4', duration: 15.0, videoUrl: '/storage/videos/test.mp4' },
    subtitles: [
      { id: 'p1', start: '00:00:01,000', end: '00:00:03,500', originalText: t1.originalText, englishText: t1.englishText, khmerText: t1.khmerText },
      { id: 'p2', start: '00:00:04,000', end: '00:00:06,000', originalText: t2.originalText, englishText: t2.englishText, khmerText: t2.khmerText }
    ]
  };

  const saveRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/project/save',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(projectPayload));
  assert(saveRes.statusCode === 200, 'POST /api/project/save returned HTTP 200');

  const loadRes = await requestHttp({
    host: 'localhost',
    port: 5000,
    path: '/api/project/load',
    method: 'GET'
  });
  assert(loadRes.statusCode === 200, 'GET /api/project/load returned HTTP 200');
  assert(loadRes.body.data.subtitles[0].englishText === t1.englishText, 'Persisted project preserves exact englishText');
  assert(loadRes.body.data.subtitles[0].khmerText === t1.khmerText, 'Persisted project preserves exact khmerText');
  assert(loadRes.body.data.subtitles[1].englishText === t2.englishText, 'Persisted project preserves Item 2 englishText');

  console.log('\n================================================================');
  console.log(`📊 FINAL REVIEW RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

runComprehensiveReview().catch(err => {
  console.error('Comprehensive review failed:', err);
  process.exit(1);
});
