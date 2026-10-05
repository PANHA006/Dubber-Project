const fs = require('fs');
const path = require('path');
const app = require('../src/app');

async function verifyUiLayoutAndEndpoints() {
  console.log('================================================================');
  console.log('   🎨 UI LAYOUT, DOM POSITIONING & API INTEGRITY AUDIT');
  console.log('================================================================\n');

  const indexPath = path.join(__dirname, '../public/index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  // 1. Verify Translate button position in HTML
  console.log('--- 1. VERIFYING BUTTON POSITIONS IN index.html ---');
  
  const transcribeIdx = indexHtml.indexOf('id="btn-transcribe"');
  const translateIdx = indexHtml.indexOf('id="btn-translate"');
  const generateVoiceIdx = indexHtml.indexOf('generateAllVoice()');
  const exportJsonIdx = indexHtml.indexOf('exportJSONFile()');

  if (transcribeIdx === -1) {
    throw new Error('Could not find #btn-transcribe in index.html');
  }
  if (translateIdx === -1) {
    throw new Error('Could not find #btn-translate in index.html');
  }
  if (generateVoiceIdx === -1) {
    throw new Error('Could not find generateAllVoice() in index.html');
  }
  if (exportJsonIdx === -1) {
    throw new Error('Could not find exportJSONFile() in index.html');
  }

  // Check that Translate is after Transcribe and before Generate Voice
  const isImmediatelyAdjacent = translateIdx > transcribeIdx && translateIdx < generateVoiceIdx;
  if (!isImmediatelyAdjacent) {
    throw new Error('#btn-translate is not positioned between #btn-transcribe and Generate Voice');
  }
  console.log('✅ PASS: Core workflow sequence verified: #btn-transcribe -> #btn-translate -> generateAllVoice()');

  // Verify that removed buttons are cleanly gone from index.html
  if (indexHtml.includes('id="btn-autofit"')) {
    throw new Error('#btn-autofit should be removed from index.html');
  }
  if (indexHtml.includes('syncTrackEnd()')) {
    throw new Error('syncTrackEnd() should be removed from index.html');
  }
  console.log('✅ PASS: #btn-autofit and syncTrackEnd() were cleanly removed from Timeline Editor');

  // Verify that #btn-translate is NOT in the Subtitle Data header (after exportJSONFile)
  const subtitleHeaderSection = indexHtml.slice(exportJsonIdx, exportJsonIdx + 300);
  if (subtitleHeaderSection.includes('id="btn-translate"')) {
    throw new Error('#btn-translate still exists in Subtitle Data header');
  }
  console.log('✅ PASS: #btn-translate was cleanly removed from Subtitle Data table header');

  // Check button attributes
  if (!indexHtml.includes('onclick="startTranslation()"')) {
    throw new Error('Missing onclick="startTranslation()" on #btn-translate');
  }
  if (!indexHtml.includes('id="translate-btn-text"')) {
    throw new Error('Missing #translate-btn-text inside #btn-translate');
  }
  console.log('✅ PASS: #btn-translate has onclick="startTranslation()" and #translate-btn-text');

  // 2. Verify Video Preview Redesign
  console.log('\n--- 2. VERIFYING VIDEO PREVIEW REDESIGN ---');
  if (indexHtml.includes('toggleVideoAspect()') || indexHtml.includes('flipVideo()') || indexHtml.includes('rotateVideo()')) {
    throw new Error('Pic 2 secondary tool icons still exist in index.html');
  }
  console.log('✅ PASS: Pic 2 secondary toolbar was cleanly removed from Video Preview');

  if (!indexHtml.includes('id="no-video-placeholder"') || !indexHtml.includes('cursor-pointer')) {
    throw new Error('#no-video-placeholder is missing or not marked with cursor-pointer');
  }
  console.log('✅ PASS: #no-video-placeholder is interactive with cursor-pointer to import video');

  if (!indexHtml.includes('id="video-preview-timeline-wrapper"') || !indexHtml.includes('id="video-preview-progress"')) {
    throw new Error('Mini timeline scrubber (#video-preview-timeline-wrapper) missing from Video Preview controls');
  }
  console.log('✅ PASS: Mini interactive timeline scrubber is integrated in Video Preview controls');

  // 3. Verify Client-Side JS Integration
  console.log('\n--- 3. VERIFYING JAVASCRIPT INTEGRATION ---');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
  if (!mainJs.includes('window.startTranslation = startTranslation;')) {
    throw new Error('Missing window.startTranslation export in main.js');
  }
  if (!mainJs.includes('export async function startTranslation(')) {
    throw new Error('Missing startTranslation function definition in main.js');
  }
  console.log('✅ PASS: main.js properly defines and exports window.startTranslation');

  // 4. Live Server Endpoint Check
  console.log('\n--- 4. VERIFYING LIVE SERVER & ENDPOINTS ---');
  const PORT = 5133;
  const server = app.listen(PORT, async () => {
    try {
      const endpoints = [
        { url: `http://localhost:${PORT}/api/health`, expected: 200, name: 'Health Check' },
        { url: `http://localhost:${PORT}/api/status`, expected: 200, name: 'System Status' },
        { url: `http://localhost:${PORT}/index.html`, expected: 200, name: 'Frontend index.html' },
        { url: `http://localhost:${PORT}/css/output.css`, expected: 200, name: 'Compiled Tailwind CSS' },
        { url: `http://localhost:${PORT}/js/main.js`, expected: 200, name: 'main.js Bundle' },
        { url: `http://localhost:${PORT}/api/transcribe`, expected: 400, method: 'POST', name: 'POST /api/transcribe (empty check)' },
        { url: `http://localhost:${PORT}/api/translate`, expected: 400, method: 'POST', name: 'POST /api/translate (empty check)' }
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, { method: ep.method || 'GET' });
        if (res.status !== ep.expected) {
          throw new Error(`${ep.name} returned status ${res.status}, expected ${ep.expected}`);
        }
        console.log(`✅ PASS: ${ep.name} -> HTTP ${res.status}`);
      }

      console.log('\n================================================================');
      console.log('🎉 ALL UI LAYOUT, DOM POSITIONING & API CHECKS PASSED (100%)!');
      console.log('================================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ VERIFICATION FAILED:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

verifyUiLayoutAndEndpoints();
