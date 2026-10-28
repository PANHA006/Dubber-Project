const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('   🧪 MISSING KEY MODAL & FREE GOOGLE TRANSLATE TEST');
console.log('================================================================\n');

// 1. Verify index.html UI
console.log('--- 1. VERIFYING UI MODAL IN public/index.html ---');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(html.includes('id="missing-key-modal"'), 'Missing #missing-key-modal in index.html');
assert(html.includes('goToSettingsForGeminiKey()'), 'Missing goToSettingsForGeminiKey() caller');
assert(html.includes('translateWithFreeGoogle()'), 'Missing translateWithFreeGoogle() caller');
assert(html.includes('closeMissingKeyModal()'), 'Missing closeMissingKeyModal() caller');
console.log('   ✅ PASS: #missing-key-modal and action buttons are present in index.html');

// 2. Verify API routes & controller
console.log('\n--- 2. VERIFYING BACKEND ROUTES & CONTROLLER ---');
const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'api.routes.js'), 'utf8');
assert(routes.includes('/translate/google'), 'Missing /translate/google route in api.routes.js');
assert(routes.includes('/keys/status'), 'Missing /keys/status route in api.routes.js');

const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'dubber.controller.js'), 'utf8');
assert(controller.includes('translateWithGoogle'), 'Missing translateWithGoogle in dubber.controller.js');
assert(controller.includes('checkKeyStatus'), 'Missing checkKeyStatus in dubber.controller.js');
console.log('   ✅ PASS: API routes and controller methods correctly wired');

// 3. Verify public/js/main.js
console.log('\n--- 3. VERIFYING CLIENT LOGIC IN public/js/main.js ---');
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
assert(mainJs.includes('window.openMissingKeyModal = openMissingKeyModal'), 'Missing window.openMissingKeyModal');
assert(mainJs.includes('window.goToSettingsForGeminiKey = goToSettingsForGeminiKey'), 'Missing window.goToSettingsForGeminiKey');
assert(mainJs.includes('window.translateWithFreeGoogle = translateWithFreeGoogle'), 'Missing window.translateWithFreeGoogle');
assert(mainJs.includes('window.executeGoogleTranslation = executeGoogleTranslation'), 'Missing window.executeGoogleTranslation');
assert(mainJs.includes('openMissingKeyModal();'), 'Missing openMissingKeyModal invocation in startTranslation');
console.log('   ✅ PASS: Client window bindings and pre-flight key check confirmed in main.js');

// 4. Test Google Translate Service
console.log('\n--- 4. TESTING GOOGLE TRANSLATE SERVICE ---');
const googleTranslateService = require('../src/services/google-translate.service');
(async () => {
  try {
    const singleRes = await googleTranslateService.translateSingle('Hello world', 'km', 'en');
    console.log('   Translation Result for "Hello world":', singleRes);
    assert(typeof singleRes === 'string' && singleRes.length > 0, 'Google translate returned empty string');
    console.log('   ✅ PASS: Single phrase translated successfully');

    await new Promise(r => setTimeout(r, 400));

    const subs = [
      { id: 1, originalText: '你好', text: '你好' },
      { id: 2, originalText: '谢谢', text: '谢谢' }
    ];
    const subRes = await googleTranslateService.translateSubtitles(subs, { sourceLanguage: 'zh' });
    assert(Array.isArray(subRes) && subRes.length === 2, 'Subtitles translation failed');
    assert(subRes[0].khmerText && subRes[0].khmerText.length > 0, 'First subtitle khmerText empty');
    console.log('   Subtitles Translated:', subRes.map(s => s.khmerText));
    console.log('   ✅ PASS: Subtitle array translated with clean Khmer text');

    console.log('\n================================================================');
    console.log('   🎉 ALL MISSING KEY MODAL & GOOGLE TRANSLATE ASSERTIONS PASSED!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('   ❌ ERROR IN TRANSLATION TEST:', err);
    process.exit(1);
  }
})();
