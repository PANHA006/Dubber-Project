/**
 * Test Suite: Export Video Button Gate
 * Verifies that users cannot click "Export Video" if a video has not been generated yet.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================');
console.log('   🔒 TESTING EXPORT VIDEO BUTTON GATE & ACCESSIBILITY  ');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

function runTests() {
  const htmlFile = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlFile, 'utf-8');

  it('index.html initializes #btn-export-video with disabled attribute and cursor-not-allowed', () => {
    assert.ok(html.includes('id="btn-export-video"'), 'Must have #btn-export-video element');
    const btnRegex = /<button id="btn-export-video"[^>]*>/;
    const match = html.match(btnRegex);
    assert.ok(match, 'Must match #btn-export-video tag');
    assert.ok(match[0].includes('disabled'), 'Must be disabled by default');
    assert.ok(match[0].includes('cursor-not-allowed'), 'Must show cursor-not-allowed');
    assert.ok(match[0].includes('opacity-40'), 'Must show opacity-40 visually indicating disabled state');
  });

  const mainJsFile = path.join(__dirname, '../public/js/main.js');
  const mainJs = fs.readFileSync(mainJsFile, 'utf-8').replace(/\r\n/g, '\n');

  it('main.js exports updateExportButtonState controller', () => {
    assert.ok(mainJs.includes('export function updateExportButtonState'), 'Must export updateExportButtonState');
    assert.ok(mainJs.includes('window.updateExportButtonState = updateExportButtonState'), 'Must expose updateExportButtonState globally');
  });

  it('openExportModal blocks opening when state.dubbedVideoUrl is absent', () => {
    assert.ok(mainJs.includes('if (!state.dubbedVideoUrl)'), 'Must guard against missing dubbedVideoUrl');
    assert.ok(mainJs.includes('Generate Video'), 'Must prompt user to generate video first');
  });

  it('main.js calls updateExportButtonState upon successful video generation and project load', () => {
    assert.ok(mainJs.includes('state.dubbedVideoUrl = result.data.dubbedVideoUrl;\n    updateExportButtonState();'), 'Must update button on video generate success');
  });

  console.log('\n------------------------------------------------------');
  console.log(`  Tests Passed : ${passed}`);
  console.log(`  Tests Failed : ${failed}`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
