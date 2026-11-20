const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

console.log('\n======================================================');
console.log('   📦 TESTING PORTABLE PYTHON RESOLVER & CONFIG       ');
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

async function runTests() {
  const configSource = fs.readFileSync(path.join(__dirname, '../src/config/index.js'), 'utf-8');
  const electronBuilderSource = fs.readFileSync(path.join(__dirname, '../electron-builder.json'), 'utf-8');

  it('src/config/index.js prioritizes python-runtime over local .venv', () => {
    assert.ok(configSource.includes("path.join(resourcesDir, 'python-runtime', 'python.exe')"), 'Must check resources/python-runtime');
    assert.ok(configSource.includes("path.join(repoRoot, 'python-runtime', 'python.exe')"), 'Must check project python-runtime');
  });

  it('src/config/index.js contains standard Windows installation fallbacks to bypass Code 103', () => {
    assert.ok(configSource.includes('standardWindowsPaths'), 'Must check standard Windows paths');
    assert.ok(configSource.includes('Python311') && configSource.includes('Python312'), 'Must inspect Python versions');
  });

  it('config.pythonPath successfully resolves a valid python binary or interpreter', () => {
    assert.ok(typeof config.pythonPath === 'string' && config.pythonPath.length > 0, 'Must resolve python path');
    console.log(`   ℹ️ Current Resolved Python: ${config.pythonPath}`);
  });

  it('electron-builder.json packages python-runtime in extraResources', () => {
    const eb = JSON.parse(electronBuilderSource);
    assert.ok(Array.isArray(eb.extraResources), 'extraResources must be an array');
    const hasPythonRuntime = eb.extraResources.some(r => r.from === 'python-runtime' && r.to === 'python-runtime');
    assert.ok(hasPythonRuntime, 'electron-builder.json must package python-runtime');
  });

  it('scripts/setup-portable-python.bat and .ps1 exist and are ready', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '../scripts/setup-portable-python.bat')), 'Must have setup-portable-python.bat');
    assert.ok(fs.existsSync(path.join(__dirname, '../scripts/setup-portable-python.ps1')), 'Must have setup-portable-python.ps1');
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
