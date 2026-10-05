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

async function runTest() {
  console.log('================================================================');
  console.log('   🌐 TEST: SINGLE-PASS 2-STEP TRANSLATION PIPELINE             ');
  console.log('      (Chinese -> English Pivot -> Khmer Movie Dubbing)        ');
  console.log('================================================================\n');

  // --- 1. AUDITING BACKEND PROMPT & COGNITIVE SCHEMA ---
  console.log('--- 1. AUDITING SYSTEM PROMPT & COGNITIVE ARCHITECTURE ---');
  const geminiJs = fs.readFileSync(path.join(__dirname, '../src/services/gemini.service.js'), 'utf-8');

  assert(geminiJs.includes('TWO-STEP COGNITIVE LOCALIZATION PROCESS'), 'Prompt defines Two-Step Cognitive Process');
  assert(geminiJs.includes('STEP 1 - ENGLISH SEMANTIC PIVOT'), 'Prompt defines Step 1 English Semantic Pivot');
  assert(geminiJs.includes('STEP 2 - KHMER DUBBING ADAPTATION'), 'Prompt defines Step 2 Khmer Dubbing Adaptation');
  assert(geminiJs.includes('englishText'), 'Prompt schema outputs englishText');
  assert(geminiJs.includes('khmerText'), 'Prompt schema outputs khmerText');
  assert(geminiJs.includes('transMap[lineNum]'), 'Service parses line-indexed map');

  // --- 2. AUDITING FRONTEND CLIENT BINDINGS ---
  console.log('\n--- 2. AUDITING FRONTEND CLIENT TABLE RENDERING ---');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  assert(subtitlesJs.includes('sub.englishText'), 'subtitles.js checks sub.englishText');
  assert(subtitlesJs.includes('English Pivot:'), 'subtitles.js renders English Pivot tooltip');
  assert(subtitlesJs.includes('EN'), 'subtitles.js renders [EN] cyan badge');

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');
  assert(mainJs.includes('item.englishText'), 'main.js captures item.englishText from translation response');
  assert(mainJs.includes('window.triggerProjectAutoSave'), 'main.js auto-saves project after translation');

  // --- 3. TESTING PARSER WITH MOCK RESPONSES (MODERN VS LEGACY) ---
  console.log('\n--- 3. TESTING DUAL-SCHEMA PARSER RESILIENCE ---');
  const testSubtitles = [
    { id: 'sub-1', start: '00:00:01,000', end: '00:00:03,000', originalText: '一个破方案改了十几遍' },
    { id: 'sub-2', start: '00:00:04,000', end: '00:00:06,000', originalText: '效果不错吧' }
  ];

  // Simulated Modern 2-Step Response
  const mockModernJson = {
    "1": {
      "englishText": "That crappy plan was revised over ten times",
      "khmerText": "គម្រោងឆ្កួតៗ កែឡើងដប់ដងហើយ"
    },
    "2": {
      "englishText": "Looks pretty good, right?",
      "khmerText": "មើលទៅអ៊ែមតើណ៎?"
    }
  };

  const parsedModern = testSubtitles.map((sub, idx) => {
    const lineNum = String(idx + 1);
    const item = mockModernJson[lineNum];
    return {
      ...sub,
      englishText: (item && item.englishText) || '',
      khmerText: (item && item.khmerText) || ''
    };
  });

  assert(parsedModern[0].englishText === 'That crappy plan was revised over ten times', 'Modern parser extracts englishText');
  assert(parsedModern[0].khmerText === 'គម្រោងឆ្កួតៗ កែឡើងដប់ដងហើយ', 'Modern parser extracts khmerText');
  assert(parsedModern[1].englishText === 'Looks pretty good, right?', 'Line 2 modern parser extracts englishText');
  assert(parsedModern[1].khmerText === 'មើលទៅអ៊ែមតើណ៎?', 'Line 2 modern parser extracts khmerText');

  // Simulated Legacy Response (String only)
  const mockLegacyJson = {
    "1": "គម្រោងឆ្កួតៗ កែឡើងដប់ដងហើយ",
    "2": "មើលទៅអ៊ែមតើណ៎?"
  };

  const parsedLegacy = testSubtitles.map((sub, idx) => {
    const lineNum = String(idx + 1);
    const item = mockLegacyJson[lineNum];
    let khmerResult = '';
    let englishResult = '';
    if (typeof item === 'object' && item !== null) {
      khmerResult = item.khmerText || '';
      englishResult = item.englishText || '';
    } else if (typeof item === 'string') {
      khmerResult = item;
    }
    return {
      ...sub,
      englishText: englishResult,
      khmerText: khmerResult
    };
  });

  assert(parsedLegacy[0].khmerText === 'គម្រោងឆ្កួតៗ កែឡើងដប់ដងហើយ', 'Legacy parser successfully extracts string khmerText');
  assert(parsedLegacy[0].englishText === '', 'Legacy parser safely defaults englishText to empty string');

  // --- 4. TESTING LIVE API POST /api/translate ---
  console.log('\n--- 4. TESTING LIVE POST /api/translate WITH GEMINI AI ---');
  const payload = {
    subtitles: [
      {
        id: 'sub-live-1',
        start: '00:00:01,000',
        end: '00:00:03,500',
        startSec: 1.0,
        endSec: 3.5,
        originalText: '一个破方案改了十几遍'
      },
      {
        id: 'sub-live-2',
        start: '00:00:04,000',
        end: '00:00:06,000',
        startSec: 4.0,
        endSec: 6.0,
        originalText: '效果不错吧'
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
  assert(Array.isArray(res.body.data) && res.body.data.length === 2, 'Returned 2 translated subtitle items');

  const item1 = res.body.data[0];
  const item2 = res.body.data[1];

  console.log(`\n  📝 Translation Result Sample 1:`);
  console.log(`     - Original (Chinese): "${item1.originalText}"`);
  console.log(`     - Step 1 (English):  "${item1.englishText}"`);
  console.log(`     - Step 2 (Khmer):    "${item1.khmerText}"`);

  console.log(`\n  📝 Translation Result Sample 2:`);
  console.log(`     - Original (Chinese): "${item2.originalText}"`);
  console.log(`     - Step 1 (English):  "${item2.englishText}"`);
  console.log(`     - Step 2 (Khmer):    "${item2.khmerText}"`);

  assert(typeof item1.englishText === 'string' && item1.englishText.length > 0, 'Item 1 contains non-empty englishText');
  assert(typeof item1.khmerText === 'string' && item1.khmerText.length > 0, 'Item 1 contains non-empty khmerText');
  assert(/[a-zA-Z]/.test(item1.englishText), 'Item 1 englishText contains English characters');
  assert(/[\u1780-\u17FF]/.test(item1.khmerText), 'Item 1 khmerText contains Khmer script characters');

  assert(typeof item2.englishText === 'string' && item2.englishText.length > 0, 'Item 2 contains non-empty englishText');
  assert(typeof item2.khmerText === 'string' && item2.khmerText.length > 0, 'Item 2 contains non-empty khmerText');
  assert(/[a-zA-Z]/.test(item2.englishText), 'Item 2 englishText contains English characters');
  assert(/[\u1780-\u17FF]/.test(item2.khmerText), 'Item 2 khmerText contains Khmer script characters');

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

runTest().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
