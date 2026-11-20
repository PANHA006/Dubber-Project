const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');

/**
 * Test Suite for System Updates & Dependencies Management
 */
async function runSystemUpdatesTest() {
  const TEST_PORT = 5092;
  const server = app.listen(TEST_PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`   📦 TESTING SYSTEM UPDATES & DEPENDENCIES API       `);
    console.log(`======================================================\n`);

    let passedCount = 0;
    let failedCount = 0;

    function assert(name, condition, extra = '') {
      if (condition) {
        console.log(`✅ PASS: ${name}`);
        passedCount++;
      } else {
        console.error(`❌ FAIL: ${name} ${extra ? '-> ' + extra : ''}`);
        failedCount++;
      }
    }

    try {
      const baseUrl = `http://localhost:${TEST_PORT}`;

      // 1. Test GET /api/system/dependencies
      const depRes = await fetch(`${baseUrl}/api/system/dependencies`);
      const depData = await depRes.json();
      assert('GET /api/system/dependencies returns 200 OK', depRes.status === 200 && depData.success === true);
      assert('Dependencies response contains FFmpeg info', depData.data?.ffmpeg?.currentVersion && depData.data?.ffmpeg?.isInstalled);
      assert('Dependencies response contains Python info', depData.data?.python?.currentVersion);
      assert('Dependencies response contains core AI packages (edge-tts, faster-whisper)', 
        Array.isArray(depData.data?.packages) && 
        depData.data.packages.some(p => p.id === 'edge-tts') &&
        depData.data.packages.some(p => p.id === 'faster-whisper')
      );

      // 2. Test POST /api/system/update-package validation
      const badReqRes = await fetch(`${baseUrl}/api/system/update-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert('POST /api/system/update-package validates missing package name with 400', badReqRes.status === 400);

      const disallowedRes = await fetch(`${baseUrl}/api/system/update-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: 'malicious-package' })
      });
      assert('POST /api/system/update-package rejects unauthorized packages', disallowedRes.status === 500 || disallowedRes.status === 400);

      // 3. Test Frontend HTML markup in public/index.html
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert('index.html contains #btn-system-updates button in navbar', indexHtml.includes('id="btn-system-updates"'));
      assert('index.html has #system-updates-modal', indexHtml.includes('id="system-updates-modal"'));
      assert('index.html has #dependencies-list-container', indexHtml.includes('id="dependencies-list-container"'));
      assert('index.html has #btn-update-all-ai button', indexHtml.includes('id="btn-update-all-ai"'));
      assert('index.html has #system-update-progress-banner', indexHtml.includes('id="system-update-progress-banner"'));
      assert('index.html has #system-update-progress-fill', indexHtml.includes('id="system-update-progress-fill"'));
      assert('index.html badge AI Core Engines has whitespace-nowrap', indexHtml.includes('whitespace-nowrap shrink-0">AI Core Engines</span>'));

      // 4. Test Frontend JS Module public/js/system-updates.js
      const updaterJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'system-updates.js'), 'utf8');
      assert('system-updates.js exposes openSystemUpdatesModal', updaterJs.includes('openSystemUpdatesModal'));
      assert('system-updates.js exposes updateAllAiEngines', updaterJs.includes('updateAllAiEngines'));
      assert('system-updates.js exposes updateSpecificPackage', updaterJs.includes('updateSpecificPackage'));
      assert('system-updates.js exposes showUpdateBanner', updaterJs.includes('showUpdateBanner'));

      console.log(`\n------------------------------------------------------`);
      console.log(`  Tests Passed : ${passedCount}`);
      console.log(`  Tests Failed : ${failedCount}`);
      console.log(`------------------------------------------------------\n`);

    } catch (err) {
      console.error('System Updates Test Suite Error:', err);
    } finally {
      server.close();
    }
  });
}

runSystemUpdatesTest();
