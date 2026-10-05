const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('../src/app');
const config = require('../src/config');

/**
 * Regression Test - HTTP Request Body Size Limit (Bug B-01)
 *
 * Express' default JSON body limit is 100kb. Bulk subtitle payloads sent to
 * /api/translate, /api/video/generate and /api/project/save easily exceed that
 * for a full movie (~733 bytes per subtitle line) and previously failed with
 * HTTP 413 Payload Too Large.
 *
 * Run: node tests/regression-body-limit.test.js
 */

async function runRegressionTests() {
  const TEST_PORT = 5091;

  const server = app.listen(TEST_PORT, async () => {
    console.log('\n======================================================');
    console.log('   REGRESSION TEST: REQUEST BODY SIZE LIMIT (B-01)');
    console.log('======================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function assert(testName, condition, detail = '') {
      if (condition) {
        console.log(`✅ PASS: ${testName}`);
        passedCount++;
      } else {
        console.error(`❌ FAIL: ${testName}${detail ? ' -> ' + detail : ''}`);
        failedCount++;
      }
    }

    const baseUrl = `http://localhost:${TEST_PORT}`;

    try {
      // --- TEST 1: Config exposes a body limit above Express' 100kb default ---
      assert(
        'config.bodyLimit is configured above the 100kb default',
        typeof config.bodyLimit === 'string' && config.bodyLimit !== '100kb',
        `bodyLimit=${config.bodyLimit}`
      );

      // --- TEST 2: Small JSON payload still accepted ---
      const smallRes = await fetch(`${baseUrl}/api/terminal-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'TEST:REG', message: 'small payload accepted' })
      });
      assert('Small JSON payload accepted (HTTP 200)', smallRes.status === 200, `status=${smallRes.status}`);

      // --- TEST 3: Payload larger than 100kb must now be accepted ---
      // 1,500 subtitle lines x ~730 bytes  ~= 1.1 MB (realistic full-movie size)
      const bulkSubtitles = Array.from({ length: 1500 }, (_, i) => ({
        id: `sub-${i + 1}`,
        start: '00:00:01,000',
        end: '00:00:03,500',
        originalText: `Original dialogue line number ${i + 1} with realistic padding text for size validation.`,
        khmerText: `បន្ទាត់អត្ថបទខ្មែរលេខ ${i + 1} សម្រាប់សាកល្បងទំហំ payload ធំ។`,
        audioUrl: `/storage/voices/voice_sub-${i + 1}.mp3?v=1790000000${i}`
      }));

      // Extra fields (subtitles/filler) are ignored by /api/terminal-log so the
      // test never floods the console while still exercising express.json().
      const bulkBody = JSON.stringify({
        category: 'TEST:REG',
        message: 'bulk subtitle payload',
        details: { subtitles: bulkSubtitles.length },
        subtitles: bulkSubtitles
      });
      const bulkBytes = Buffer.byteLength(bulkBody, 'utf-8');

      assert(
        'Bulk payload exceeds the legacy 100kb limit',
        bulkBytes > 100 * 1024,
        `bytes=${bulkBytes}`
      );

      const bulkRes = await fetch(`${baseUrl}/api/terminal-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bulkBody
      });
      assert(
        `Bulk JSON payload of ${(bulkBytes / 1024 / 1024).toFixed(2)} MB accepted (HTTP 200)`,
        bulkRes.status === 200,
        `status=${bulkRes.status} bytes=${bulkBytes}`
      );

      // --- TEST 4: urlencoded limit is aligned as well ---
      const formRes = await fetch(`${baseUrl}/api/terminal-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'category=TEST%3AREG&message=urlencoded+payload&filler=' + 'x'.repeat(200000)
      });
      assert(
        'Large urlencoded payload (~195 KB) accepted (HTTP 200)',
        formRes.status === 200,
        `status=${formRes.status}`
      );

      // --- TEST 5: Method / route still validated (no express.json regression) ---
      const notFoundRes = await fetch(`${baseUrl}/api/definitely-missing-endpoint`);
      assert('Unknown route still returns HTTP 404', notFoundRes.status === 404, `status=${notFoundRes.status}`);
    } catch (err) {
      console.error('❌ EXCEPTION DURING BODY-LIMIT TESTS:', err.message);
      failedCount++;
    }

    console.log('\n------------------------------------------------------');
    console.log(`  Tests Passed : ${passedCount}`);
    console.log(`  Tests Failed : ${failedCount}`);
    console.log('------------------------------------------------------');
    console.log(failedCount === 0
      ? '🎉 ALL BODY-LIMIT REGRESSION TESTS PASSED!'
      : '⚠️ SOME BODY-LIMIT REGRESSION TESTS FAILED');

    server.close(() => process.exit(failedCount === 0 ? 0 : 1));
  });

  server.on('error', (err) => {
    console.error(`❌ Could not start test server on port ${TEST_PORT}:`, err.message);
    process.exit(1);
  });
}

runRegressionTests();
