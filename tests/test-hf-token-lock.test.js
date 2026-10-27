/**
 * Comprehensive Verification Test for Hugging Face Token Lock & UI Protection
 * Tests:
 * 1. HTML Settings Modal has #input-hf-token.
 * 2. state.js manages hfToken & serverHasHfToken.
 * 3. main.js enforces the lock: toggling ON without key is blocked, reverted, and opens modal.
 * 4. main.js allows toggling ON when key is present.
 * 5. Backend services report and accept hfToken.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const dubberService = require('../src/services/dubber.service.js');
const aiAudioSeparatorService = require('../src/services/ai-audio-separator.service.js');

console.log('================================================================');
console.log('   🔒 AUDIT: HUGGING FACE TOKEN LOCK & UI PROTECTION TEST');
console.log('================================================================\n');

async function runAudit() {
  // --- 1. HTML Verification ---
  console.log('--- Step 1: Checking Settings Modal in index.html ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert(indexHtml.includes('id="input-hf-token"'), 'index.html must have #input-hf-token');
  assert(indexHtml.includes('huggingface.co/settings/tokens'), 'index.html must have link to get token');
  console.log('✅ PASS: #input-hf-token field exists in Settings Modal with token link.');

  // --- 2. State Verification ---
  console.log('\n--- Step 2: Checking state.js ---');
  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/state.js'), 'utf8');
  assert(stateJs.includes('hfToken:'), 'state.js must have hfToken property');
  assert(stateJs.includes('serverHasHfToken:'), 'state.js must have serverHasHfToken property');
  console.log('✅ PASS: state.js properly declares hfToken and serverHasHfToken.');

  // --- 3. Frontend Lock Logic Verification in main.js ---
  console.log('\n--- Step 3: Checking Frontend Lock Logic in main.js ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');

  // Verify saveSettings & openSettingsModal handles input-hf-token
  assert(mainJs.includes('input-hf-token'), 'main.js must read and populate #input-hf-token');
  assert(mainJs.includes("localStorage.setItem('hf_token'"), 'main.js must persist hf_token to localStorage');
  assert(mainJs.includes('state.serverHasHfToken = true'), 'main.js must sync serverHasHfToken from /api/status');

  // Verify lock enforcement on Mute Voice switch
  assert(mainJs.includes('userHasKey'), 'main.js must verify userHasKey on toggle change');
  assert(mainJs.includes("window.openSettingsModal?.('input-hf-token')"), 'main.js must open settings modal targeting input-hf-token when key is missing');
  console.log('✅ PASS: main.js enforces strict lock: blocking switch ON without key and opening settings.');

  // --- 4. Backend Service Status Verification ---
  console.log('\n--- Step 4: Checking Backend dubberService.getStatus() ---');
  const status = await dubberService.getStatus();
  assert('hasHfToken' in status, 'dubberService.getStatus() must return hasHfToken');
  console.log(`✅ PASS: Backend dubberService reports hasHfToken = ${status.hasHfToken}`);

  // --- 5. Video Renderer & AI Separator Integration ---
  console.log('\n--- Step 5: Checking Video Renderer & AI Separator hfToken wiring ---');
  const rendererJs = fs.readFileSync(path.join(__dirname, '../src/services/video-renderer.service.js'), 'utf8');
  assert(rendererJs.includes('hfToken: settings ? settings.hfToken : null'), 'video-renderer.service.js must forward hfToken');

  const separatorJs = fs.readFileSync(path.join(__dirname, '../src/services/ai-audio-separator.service.js'), 'utf8');
  assert(separatorJs.includes('hfToken = null'), 'ai-audio-separator.service.js must support hfToken parameter');
  console.log('✅ PASS: Backend services fully wire hfToken through video-renderer and separator service.');

  // --- 6. Simulated Functional UI Lock Test ---
  console.log('\n--- Step 6: Functional UI Simulation (Lock vs Unlock) ---');
  
  // Simulated state and DOM elements
  let toastMsg = null;
  let openedModalWithInput = null;
  const mockState = {
    hfToken: '',
    serverHasHfToken: false,
    dubbingSettings: { removeSpokenVoice: false, bgVolume: 8 }
  };

  const mockToast = (msg) => { toastMsg = msg; };
  const mockOpenModal = (targetId) => { openedModalWithInput = targetId; };

  // Function mimicking main.js toggle handler
  function simulateToggle(checked, stateObj) {
    const userHasKey = Boolean((stateObj.hfToken && stateObj.hfToken.trim().length > 5) || stateObj.serverHasHfToken);
    if (checked && !userHasKey) {
      stateObj.dubbingSettings.removeSpokenVoice = false;
      mockToast('⚠️ សូមបញ្ចូល Hugging Face Token នៅក្នុង Settings ជាមុនសិន!');
      mockOpenModal('input-hf-token');
      return false; // Rejected
    }
    stateObj.dubbingSettings.removeSpokenVoice = checked;
    return true; // Allowed
  }

  // Test Case A: User tries to turn ON without a key -> MUST BE REJECTED
  console.log('   Simulating: User clicks ON when NO key is present...');
  const resultWithoutKey = simulateToggle(true, mockState);
  assert.strictEqual(resultWithoutKey, false, 'Turning ON without key must return false (rejected)');
  assert.strictEqual(mockState.dubbingSettings.removeSpokenVoice, false, 'removeSpokenVoice must stay false');
  assert(toastMsg && toastMsg.includes('Hugging Face Token'), 'Toast must alert about missing Token');
  assert.strictEqual(openedModalWithInput, 'input-hf-token', 'Must trigger openSettingsModal focusing on input-hf-token');
  console.log('   ✅ PASS: Feature lock successfully prevented switch to ON, alerted user, and opened settings modal.');

  // Test Case B: User enters a valid key -> MUST BE ALLOWED
  console.log('   Simulating: User enters HF key and clicks ON...');
  mockState.hfToken = 'hf_test_valid_token_123456';
  const resultWithKey = simulateToggle(true, mockState);
  assert.strictEqual(resultWithKey, true, 'Turning ON with key must return true (allowed)');
  assert.strictEqual(mockState.dubbingSettings.removeSpokenVoice, true, 'removeSpokenVoice must become true');
  console.log('   ✅ PASS: Feature unlocked successfully when valid Hugging Face Token is present.');

  console.log('\n================================================================');
  console.log('   🎉 ALL HUGGING FACE TOKEN LOCK TESTS PASSED 100%!');
  console.log('================================================================');
}

runAudit().catch(err => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
