const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

async function runReviewAndTest() {
  console.log('================================================================');
  console.log('   🔍 DEEP REVIEW & AUDIT: UI LAYOUT & VAD SLIDER INTEGRATION   ');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');
  const stateJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'state.js'), 'utf-8');

  let passedChecks = 0;
  let totalChecks = 0;

  function test(desc, fn) {
    totalChecks++;
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passedChecks++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     ↳ ${e.message}`);
    }
  }

  console.log('--- 1. AUDITING 2-INDEPENDENT-COLUMNS STUDIO LAYOUT ---');

  test('Main tag has flex container layout without duplicates', () => {
    const mainMatches = indexHtml.match(/<main[\s\S]*?<\/main>/g);
    assert(mainMatches && mainMatches.length === 1, 'There must be exactly one <main> block in index.html');
    assert(indexHtml.indexOf('<main class="flex-1 flex overflow-hidden p-2.5 gap-2.5">') !== -1, 'Main container must be flex with gap-2.5');
  });

  test('Left Column contains Video Preview and generous Dubbing Settings (h-[285px])', () => {
    assert(indexHtml.includes('<!-- ==================== LEFT COLUMN: Video Preview & Dubbing Settings ==================== -->'), 'Left column marker found');
    assert(indexHtml.includes('h-[285px] bg-[#0f1422] border border-slate-800/90 rounded-xl p-3 shadow-lg shrink-0 flex flex-col justify-between overflow-hidden'), 'Dubbing Settings has generous h-[285px]');
  });

  test('Right Column contains Subtitle Data (flex-1) and optimized Timeline Editor (h-[190px])', () => {
    assert(indexHtml.includes('<!-- ==================== RIGHT COLUMN: Subtitle Data & Timeline Editor ==================== -->'), 'Right column marker found');
    assert(indexHtml.includes('class="flex-1 bg-[#0f1422] border border-slate-800/90 rounded-xl p-3 flex flex-col shadow-lg overflow-hidden min-h-0"'), 'Subtitle Data expands to take full vertical space');
    assert(indexHtml.includes('h-[190px] bg-[#0f1422] border border-slate-800/90 rounded-xl p-3 flex flex-col shadow-lg overflow-hidden justify-between shrink-0'), 'Timeline Editor is optimized at h-[190px]');
  });

  console.log('\n--- 2. AUDITING VAD FILTER SLIDER & DYNAMIC BADGE LOGIC ---');

  test('VAD Filter is configured as an interactive range slider (0.0 to 1.0, step 0.05, default 0.10)', () => {
    assert(indexHtml.includes('id="setting-vad-threshold"'), 'Contains #setting-vad-threshold input');
    assert(indexHtml.includes('type="range" id="setting-vad-threshold" min="0.0" max="1.0" step="0.05" value="0.10"'), 'Slider attributes min="0.0" max="1.0" step="0.05" value="0.10" verified');
  });

  test('VAD Badge displays dynamic colors based on threshold values', () => {
    assert(indexHtml.includes('id="val-vad-label"'), 'Contains #val-vad-label badge');
    assert(mainJs.includes('updateVadBadge(val)'), 'main.js defines updateVadBadge function');
    assert(mainJs.includes('violet-500'), 'Includes violet styling for < 0.20 (ម៉ត់ខ្លាំង)');
    assert(mainJs.includes('sky-500'), 'Includes sky styling for 0.20 - 0.40 (ល្មម)');
    assert(mainJs.includes('amber-500'), 'Includes amber styling for 0.40 - 0.60 (ច្បាស់)');
    assert(mainJs.includes('rose-500'), 'Includes rose styling for > 0.60 (តឹងរ៉ឹង)');
  });

  console.log('\n--- 3. AUDITING DUBBING SETTINGS VALUES & DEFAULTS ---');

  test('Max Merged Segments Limit is configured (1 to 10, step 1, default 3)', () => {
    assert(indexHtml.includes('id="setting-max-merge" min="1" max="10" step="1" value="3"'), 'Max Merged input min=1 max=10 step=1 value=3');
    assert(indexHtml.includes('id="val-max-merge"'), 'Contains #val-max-merge badge');
  });

  test('state.js DEFAULT_DUBBING_SETTINGS matches UI defaults', () => {
    assert(stateJs.includes('vadThreshold: 0.10'), 'state.js vadThreshold default is 0.10');
    assert(stateJs.includes('maxMergeLimit: 3'), 'state.js maxMergeLimit default is 3');
    assert(stateJs.includes('maxPauseGap: 0.20'), 'state.js maxPauseGap default is 0.20');
    assert(stateJs.includes('endPadding: 0.70'), 'state.js endPadding default is 0.70');
    assert(stateJs.includes('bgVolume: 8'), 'state.js bgVolume default is 8');
    assert(stateJs.includes('removeSpokenVoice: true'), 'state.js removeSpokenVoice default is true');
  });

  test('Reset Defaults button resets all 6 settings and updates UI badges', () => {
    assert(indexHtml.includes('id="btn-reset-dubbing-settings" onclick="resetDubbingSettings()"'), 'Reset button exists in DOM');
    assert(mainJs.includes('export function resetDubbingSettings()'), 'resetDubbingSettings function exported in main.js');
    assert(mainJs.includes('state.dubbingSettings = { ...DEFAULT_DUBBING_SETTINGS }'), 'Resets to pristine defaults');
  });

  console.log('\n--- 4. AUDITING LIVE HTTP SERVER & CSS ASSETS ---');

  const checkEndpoint = (path, expectedStatus = 200) => {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: 'localhost', port: 5000, path, timeout: 3000 }, (res) => {
        if (res.statusCode === expectedStatus) {
          resolve(true);
        } else {
          reject(new Error(`Endpoint ${path} returned status ${res.statusCode}, expected ${expectedStatus}`));
        }
      });
      req.on('error', reject);
    });
  };

  try {
    await checkEndpoint('/');
    console.log('  ✅ PASS: HTTP GET / (index.html) -> 200 OK');
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ FAIL: HTTP GET / -> ${err.message}`);
  }
  totalChecks++;

  try {
    await checkEndpoint('/css/output.css');
    console.log('  ✅ PASS: HTTP GET /css/output.css -> 200 OK');
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ FAIL: HTTP GET /css/output.css -> ${err.message}`);
  }
  totalChecks++;

  try {
    await checkEndpoint('/api/health');
    console.log('  ✅ PASS: HTTP GET /api/health -> 200 OK');
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ FAIL: HTTP GET /api/health -> ${err.message}`);
  }
  totalChecks++;

  console.log('\n================================================================');
  console.log(`📊 AUDIT RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks/totalChecks)*100)}%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runReviewAndTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
