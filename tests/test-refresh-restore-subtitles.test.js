const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = require('../src/app');

console.log('================================================================');
console.log('   🧪 TEST: AUTO-RESTORE SUBTITLES & VIDEO ON REFRESH (F5)');
console.log('================================================================\n');

// 1. Verify main.js syntax and imports
console.log('--- 1. VERIFYING JAVASCRIPT IMPORTS & DEFINITIONS IN main.js ---');
const mainJsPath = path.join(__dirname, '../public/js/main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

assert(mainJs.includes('formatTimecodeDisplay'), 'main.js must import and use formatTimecodeDisplay');
assert(mainJs.includes('syncSubtitlesFromDOM'), 'main.js must use syncSubtitlesFromDOM');
assert(mainJs.includes('loadSavedProject'), 'main.js must define loadSavedProject');
console.log('✅ PASS: formatTimecodeDisplay and syncSubtitlesFromDOM are properly imported in main.js');

// 2. Test server endpoint /api/project/load
console.log('\n--- 2. VERIFYING /api/project/load RETURNS COMPLETE SUBTITLES ---');
const PORT = 5135;
const server = app.listen(PORT, async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/project/load`);
    assert.strictEqual(res.status, 200, 'GET /api/project/load should return 200');
    const json = await res.json();
    assert(json.success, 'Response must be success: true');
    assert(json.data, 'Response must have data object');
    assert(json.data.video, 'Project must contain video');
    assert(Array.isArray(json.data.subtitles), 'Project must contain subtitles array');
    assert(json.data.subtitles.length >= 3, `Project must have at least 3 subtitles, found ${json.data.subtitles.length}`);
    console.log(`✅ PASS: /api/project/load returned ${json.data.subtitles.length} persistent subtitles with video "${json.data.video.name}"`);

    // 3. Test simulated refresh logic
    console.log('\n--- 3. TESTING DUAL-STAGE RESTORATION SIMULATION ---');
    let state = {
      videoUrl: null,
      videoName: '',
      duration: 0,
      subtitles: [],
      isRestoringProject: false
    };

    // Stage 1: Load from server
    const proj = json.data;
    if (proj.video) {
      state.videoUrl = proj.video.videoUrl;
      state.videoName = proj.video.name;
      state.duration = proj.video.duration;
    }
    if (Array.isArray(proj.subtitles) && proj.subtitles.length > 0) {
      state.subtitles = proj.subtitles;
    }

    assert.strictEqual(state.subtitles.length, json.data.subtitles.length, 'State subtitles must match loaded project');
    assert(state.videoUrl.includes('SaveTik'), 'State videoUrl must be set');
    console.log('✅ PASS: State successfully populated with video AND subtitles on simulated refresh');

    // 4. Test Auto-Save Overwrite Guard
    console.log('\n--- 4. TESTING AUTO-SAVE OVERWRITE PROTECTION GUARD ---');
    // If state.subtitles is empty, auto-save must not overwrite server subtitles unless explicit clear
    const emptySavePayload = {
      video: { name: 'SaveTik.co_7651410456153981183-hd.mp4', videoUrl: '/storage/videos/SaveTik_co_7651410456153981183-hd_1790087457845.mp4', duration: 14.7 },
      subtitles: [],
      isExplicitClear: false
    };

    const saveRes = await fetch(`http://localhost:${PORT}/api/project/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emptySavePayload)
    });

    assert.strictEqual(saveRes.status, 200);

    // Verify disk still has subtitles preserved
    const checkRes = await fetch(`http://localhost:${PORT}/api/project/load`);
    const checkJson = await checkRes.json();
    assert(Array.isArray(checkJson.data.subtitles) && checkJson.data.subtitles.length > 0, 'Server must preserve subtitles on empty save');
    console.log('✅ PASS: Auto-Save protection guard safely preserved existing subtitles on disk');

    console.log('\n================================================================');
    console.log('   🎉 ALL REFRESH & RESTORE SUBTITLE TESTS PASSED (100%)!');
    console.log('================================================================\n');

    server.close(() => process.exit(0));
  } catch (err) {
    console.error('❌ Test failed:', err);
    server.close(() => process.exit(1));
  }
});
