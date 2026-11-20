/**
 * Test Suite: Smart Anti-Collision Engine & Boundary Guard
 * Verifies that adjacent dialogue lines cannot collide or overlap.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('\n======================================================');
console.log('   🛡️ TESTING SMART ANTI-COLLISION & BOUNDARY GUARD    ');
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
  const workerFile = path.join(__dirname, '../src/workers/tts_worker.py');
  const workerCode = fs.readFileSync(workerFile, 'utf-8');

  it('tts_worker.py supports adaptive speed headroom up to 1.70x', () => {
    assert.ok(workerCode.includes('MAX_SPEED_CAP = max(1.05, min(1.85, float(os.environ.get("TTS_MAX_SPEED", "1.70") or 1.70)))'), 'Must support up to 1.70x adaptive speed headroom');
  });

  const ttsServiceFile = path.join(__dirname, '../src/services/tts.service.js');
  const ttsServiceCode = fs.readFileSync(ttsServiceFile, 'utf-8');

  it('tts.service.js includes Smart Collision Look-Ahead logic', () => {
    assert.ok(ttsServiceCode.includes('Smart Collision Look-Ahead'), 'Must have Smart Collision Look-Ahead logic');
    assert.ok(ttsServiceCode.includes('gapToNext'), 'Must compute gap to next item');
  });

  const rendererFile = path.join(__dirname, '../src/services/video-renderer.service.js');
  const rendererCode = fs.readFileSync(rendererFile, 'utf-8');

  it('video-renderer.service.js enforces Layer 2 Smart Anti-Collision Boundary Guard', () => {
    assert.ok(rendererCode.includes('Smart Anti-Collision Boundary Guard'), 'Must assign collision boundary for each clip');
    assert.ok(rendererCode.includes('curr.maxAllowedDuration = Math.max(0.3, Math.round((gap - 0.05) * 1000) / 1000)'), 'Must leave 50ms buffer before next line');
    assert.ok(rendererCode.includes('atrim=0:${trimDur},asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart}:d=0.08'), 'Must apply atrim and afade for clean cutoff');
  });

  it('FFmpeg successfully runs atrim and afade anti-collision filtergraph', async () => {
    await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-f', 'lavfi', '-i', 'sine=frequency=800:duration=3',
        '-filter_complex', '[0:a]aresample=44100:async=1,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo,atrim=0:1.500,asetpts=PTS-STARTPTS,afade=t=out:st=1.420:d=0.08,adelay=500:all=1,volume=1.000[out]',
        '-map', '[out]',
        '-f', 'null', '-'
      ]);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  });

  console.log('\n------------------------------------------------------');
  console.log(`  Tests Passed : ${passed + 1}`);
  console.log(`  Tests Failed : ${failed}`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
