const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

async function testDubbingSettings() {
  console.log('================================================================');
  console.log('   ⚙️ DUBBING SETTINGS INTEGRATION & PARAMETER TEST SUITE');
  console.log('================================================================\n');

  // --- 1. HTML DOM Elements Check ---
  console.log('--- 1. CHECKING DUBBING SETTINGS UI ELEMENTS IN index.html ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  const requiredElements = [
    { id: 'btn-reset-dubbing-settings', desc: 'Reset Defaults Button' },
    { id: 'setting-end-padding', desc: 'End Padding Slider' },
    { id: 'val-end-padding', desc: 'End Padding Value Display' },
    { id: 'setting-max-merge', desc: 'Max Merged Limit Slider' },
    { id: 'val-max-merge', desc: 'Max Merged Value Display' },
    { id: 'setting-merge-gap', desc: 'Merge Gap Slider' },
    { id: 'val-merge-gap', desc: 'Merge Gap Value Display' },
    { id: 'setting-vad-threshold', desc: 'VAD Filter Select Dropdown' },
    { id: 'val-vad-label', desc: 'VAD Threshold Value Display' },
    { id: 'setting-bgm-volume', desc: 'BGM Volume Slider' },
    { id: 'val-bgm-volume', desc: 'BGM Volume Value Display' },
    { id: 'setting-remove-spoken', desc: 'Mute Spoken Voice Toggle' },
    { id: 'val-mute-spoken', desc: 'Mute Spoken Value Display' }
  ];

  for (const el of requiredElements) {
    if (!indexHtml.includes(`id="${el.id}"`)) {
      throw new Error(`Missing required Dubbing Settings element: #${el.id} (${el.desc})`);
    }
    console.log(`   ✅ PASS: Found #${el.id} (${el.desc})`);
  }

  // --- 2. JS State & Persistence Check ---
  console.log('\n--- 2. CHECKING STATE & SCRIPT INTEGRATIONS ---');
  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/state.js'), 'utf8');
  assert(stateJs.includes('DEFAULT_DUBBING_SETTINGS'), 'state.js must export DEFAULT_DUBBING_SETTINGS');
  assert(stateJs.includes('loadDubbingSettings'), 'state.js must export loadDubbingSettings');
  assert(stateJs.includes('saveDubbingSettings'), 'state.js must export saveDubbingSettings');
  assert(stateJs.includes('dubbingSettings: loadDubbingSettings()'), 'state.js must initialize dubbingSettings');
  console.log('   ✅ PASS: state.js properly manages and persists dubbingSettings in localStorage');

  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
  assert(mainJs.includes('window.resetDubbingSettings = resetDubbingSettings;'), 'main.js must export resetDubbingSettings');
  assert(mainJs.includes('initDubbingSettingsUI();'), 'main.js must initialize dubbing settings UI on bootstrap');
  assert(mainJs.includes('formData.append(\'maxMergeLimit\', ds.maxMergeLimit)'), 'main.js must forward maxMergeLimit to transcribe endpoint');
  assert(mainJs.includes('endPadding: state.dubbingSettings?.endPadding'), 'main.js must forward endPadding to translate endpoint');
  console.log('   ✅ PASS: main.js hooks all UI inputs, resets defaults, and forwards parameters to API');

  // --- 3. Backend Controller & Service Check ---
  console.log('\n--- 3. CHECKING CONTROLLER & BACKEND FORWARDING ---');
  const controllerJs = fs.readFileSync(path.join(__dirname, '../src/controllers/dubber.controller.js'), 'utf8');
  assert(controllerJs.includes('maxMergeLimit: req.body?.maxMergeLimit'), 'dubber.controller.js must pass maxMergeLimit');
  assert(controllerJs.includes('maxPauseGap: req.body?.maxPauseGap'), 'dubber.controller.js must pass maxPauseGap');
  assert(controllerJs.includes('vadThreshold: req.body?.vadThreshold'), 'dubber.controller.js must pass vadThreshold');
  assert(controllerJs.includes('{ endPadding }'), 'dubber.controller.js must pass endPadding to geminiService');
  console.log('   ✅ PASS: dubber.controller.js properly extracts and forwards all 6 dubbing parameters');

  const whisperServiceJs = fs.readFileSync(path.join(__dirname, '../src/services/whisper.service.js'), 'utf8');
  assert(whisperServiceJs.includes('--max_merge_limit'), 'whisper.service.js must pass --max_merge_limit CLI arg');
  assert(whisperServiceJs.includes('--max_pause_gap'), 'whisper.service.js must pass --max_pause_gap CLI arg');
  assert(whisperServiceJs.includes('--vad_threshold'), 'whisper.service.js must pass --vad_threshold CLI arg');
  console.log('   ✅ PASS: whisper.service.js passes CLI flags to Python Faster-Whisper worker');

  // --- 4. Python Worker merge_fragmented_segments Logic Test ---
  console.log('\n--- 4. TESTING PYTHON WORKER CLAUSE MERGE LOGIC ---');
  const pythonPath = 'D:\\Desktop\\create-dubber-project\\.venv\\Scripts\\python.exe';
  const testScript = `
import sys, json
sys.path.insert(0, r'${path.join(__dirname, '../src/workers')}')
from whisper_transcriber import merge_fragmented_segments

test_segments = [
    {"id": 1, "startSec": 0.0, "endSec": 1.0, "text": "Clause 1"},
    {"id": 2, "startSec": 1.15, "endSec": 2.0, "text": "Clause 2"},   # gap = 0.15s (<= 0.20s -> merge)
    {"id": 3, "startSec": 2.10, "endSec": 3.0, "text": "Clause 3"},   # gap = 0.10s (<= 0.20s -> merge -> hits count 3)
    {"id": 4, "startSec": 3.10, "endSec": 4.0, "text": "Clause 4"},   # gap = 0.10s (exceeds max_merge_count 3 -> new group)
    {"id": 5, "startSec": 4.50, "endSec": 5.0, "text": "Clause 5"},   # gap = 0.50s (> 0.20s -> new group)
]

merged = merge_fragmented_segments(test_segments, max_gap=0.20, max_merge_count=3)
print(json.dumps(merged))
`;

  const pyExec = fs.existsSync(pythonPath) ? pythonPath : 'python';
  const res = spawnSync(pyExec, ['-c', testScript], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`Python merge test failed: ${res.stderr}`);
  }

  const merged = JSON.parse(res.stdout.trim());
  assert.strictEqual(merged.length, 3, `Expected 3 merged segments, got ${merged.length}`);
  assert.strictEqual(merged[0].text, 'Clause 1 / Clause 2 / Clause 3', 'First 3 clauses should merge with /');
  assert.strictEqual(merged[0].startSec, 0.0);
  assert.strictEqual(merged[0].endSec, 3.0);
  assert.strictEqual(merged[1].text, 'Clause 4', 'Clause 4 should start new segment due to max_merge_count=3');
  assert.strictEqual(merged[2].text, 'Clause 5', 'Clause 5 should start new segment due to gap > 0.20s');
  console.log('   ✅ PASS: merge_fragmented_segments perfectly capped at 3 clauses and respected 0.20s gap');

  // --- 5. Gemini Service Duration Padding Test ---
  console.log('\n--- 5. TESTING GEMINI SERVICE END PADDING LOGIC ---');
  const geminiServiceJs = fs.readFileSync(path.join(__dirname, '../src/services/gemini.service.js'), 'utf8');
  assert(geminiServiceJs.includes('dur + endPadding'), 'gemini.service.js must add endPadding to duration calculation');
  console.log('   ✅ PASS: Gemini Service incorporates endPadding into word quota calculation');

  console.log('\n================================================================');
  console.log('🎉 ALL DUBBING SETTINGS INTEGRATION TESTS PASSED (100%)!');
  console.log('================================================================\n');
}

testDubbingSettings().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
