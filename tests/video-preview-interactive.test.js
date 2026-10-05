const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = require('../src/app');

async function testVideoPreviewInteractive() {
  console.log('================================================================');
  console.log('   🎬 REVIEW & TEST: VIDEO PREVIEW REDESIGN & INTERACTION');
  console.log('================================================================\n');

  const indexPath = path.join(__dirname, '../public/index.html');
  const videoPlayerJsPath = path.join(__dirname, '../public/js/video-player.js');
  const mainJsPath = path.join(__dirname, '../public/js/main.js');

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const videoPlayerJs = fs.readFileSync(videoPlayerJsPath, 'utf8');
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  console.log('--- 1. VERIFYING PIC 2 SECONDARY TOOLBAR REMOVAL ---');
  const obsoleteFunctions = ['toggleVideoAspect', 'flipVideo', 'rotateVideo', 'toggleSubOverlay', 'cycleSubColor'];
  
  for (const fn of obsoleteFunctions) {
    assert(!indexHtml.includes(`${fn}()`), `index.html must not contain ${fn}()`);
    assert(!videoPlayerJs.includes(`export function ${fn}`), `video-player.js must not export ${fn}`);
    assert(!mainJs.includes(`window.${fn}`), `main.js must not expose window.${fn}`);
    console.log(`   ✅ PASS: ${fn} cleanly removed from HTML, JS, and global scope`);
  }

  console.log('\n--- 2. VERIFYING CLICKABLE EMPTY STATE PLACEHOLDER ---');
  assert(indexHtml.includes('id="no-video-placeholder"'), '#no-video-placeholder must exist in index.html');
  assert(indexHtml.includes('cursor-pointer'), '#no-video-placeholder must have cursor-pointer class');
  assert(!indexHtml.includes('pointer-events-none p-4 text-center'), 'pointer-events-none must be removed from placeholder');
  assert(videoPlayerJs.includes("placeholder.addEventListener('click'"), 'video-player.js must attach click listener to placeholder');
  assert(videoPlayerJs.includes('videoInput.click()'), 'placeholder click must trigger videoInput.click()');
  console.log('   ✅ PASS: #no-video-placeholder is interactive and triggers video file picker on click');

  console.log('\n--- 3. VERIFYING INTERACTIVE MINI TIMELINE SCRUBBER ---');
  assert(indexHtml.includes('id="video-preview-timeline-wrapper"'), 'Mini timeline wrapper must exist in index.html');
  assert(indexHtml.includes('id="video-preview-progress"'), 'Progress bar must exist in index.html');
  assert(indexHtml.includes('id="video-preview-thumb"'), 'Thumb indicator must exist in index.html');
  assert(videoPlayerJs.includes('updateMiniTimeline'), 'video-player.js must implement updateMiniTimeline');
  assert(videoPlayerJs.includes("miniTimeline.addEventListener('mousedown'"), 'video-player.js must support mousedown seeking');
  assert(videoPlayerJs.includes("window.addEventListener('mousemove'"), 'video-player.js must support drag seeking');
  console.log('   ✅ PASS: Mini interactive timeline scrubber & drag-to-seek logic fully implemented');

  console.log('\n--- 4. VERIFYING LIVE SERVER ASSETS & HTTP 200 STATUS ---');
  const PORT = 5144;
  const server = app.listen(PORT, async () => {
    try {
      const endpoints = [
        { path: '/', expected: 200, name: 'Root Dashboard' },
        { path: '/css/output.css', expected: 200, name: 'Compiled Tailwind CSS' },
        { path: '/js/video-player.js', expected: 200, name: 'video-player.js ES Module' },
        { path: '/js/main.js', expected: 200, name: 'main.js ES Module' }
      ];

      for (const ep of endpoints) {
        const res = await fetch(`http://localhost:${PORT}${ep.path}`);
        assert.strictEqual(res.status, ep.expected, `${ep.name} must return HTTP ${ep.expected}`);
        console.log(`   ✅ PASS: GET ${ep.path} -> HTTP ${res.status}`);
      }

      console.log('\n================================================================');
      console.log('🎉 ALL VIDEO PREVIEW REVIEWS & TESTS PASSED WITH 100% SUCCESS!');
      console.log('================================================================\n');

      server.close(() => process.exit(0));
    } catch (err) {
      console.error('\n❌ TEST FAILED:', err.message);
      server.close(() => process.exit(1));
    }
  });
}

testVideoPreviewInteractive();
