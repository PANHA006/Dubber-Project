/**
 * Test: FFmpeg mux progress reporting
 *
 * The final mux stage used to be a black box — ffmpeg was spawned, stderr was
 * accumulated but never parsed, and nothing was logged until the process
 * exited. On a 52-minute video that is ~3 minutes of silence right after
 * "Spawning FFmpeg dubbing pipeline", which looks exactly like a hang.
 *
 * This verifies the fix: ffmpeg is now given `-progress pipe:1 -nostats` and
 * `trackFFmpegProgress()` turns its `out_time_us` stream into a live percentage.
 *
 * Run: node tests/test-render-progress.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RENDERER_PATH = require.resolve('../src/services/video-renderer.service.js');
const LOGGER_PATH = require.resolve('../src/utils/terminal-logger.js');

const source = fs.readFileSync(RENDERER_PATH, 'utf8');
const { trackFFmpegProgress } = require(RENDERER_PATH);

let passed = 0;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal stand-in for a spawned ChildProcess exposing only a stdout stream. */
function fakeProc() {
  const handlers = {};
  return {
    stdout: { on(event, fn) { handlers[event] = fn; } },
    push(text) { handlers.data(Buffer.from(text, 'utf8')); }
  };
}

/**
 * Reload the renderer with `formatTerminalProgress` patched so emitted ticks
 * can be asserted instead of printed. The renderer destructures the logger at
 * require time, so the cache must be cleared for the patch to take effect.
 */
function withRecordedTicks() {
  const logger = require(LOGGER_PATH);
  const ticks = [];
  const realProgress = logger.formatTerminalProgress;
  logger.formatTerminalProgress = (tag, current, total, message, details) => {
    ticks.push({ tag, current, total, message, details });
  };
  delete require.cache[RENDERER_PATH];
  const track = require(RENDERER_PATH).trackFFmpegProgress;

  return {
    ticks,
    track,
    restore() {
      logger.formatTerminalProgress = realProgress;
      delete require.cache[RENDERER_PATH];
    }
  };
}

(async () => {
  console.log('================================================================');
  console.log('   🧪 FFMPEG MUX PROGRESS TEST');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Wiring
  // -------------------------------------------------------------------------
  console.log('--- 1. VERIFYING FFMPEG PROGRESS WIRING ---');

  await check('both ffmpeg spawns request machine-readable progress', () => {
    const occurrences = source.split("'-progress', 'pipe:1', '-nostats'").length - 1;
    assert.strictEqual(occurrences, 2,
      `expected the main mux AND the transcode fallback to stream progress, found ${occurrences}`);
  });

  await check('both spawn sites attach the progress tracker', () => {
    const attachCount = source.split('const stopProgress = trackFFmpegProgress').length - 1;
    assert.strictEqual(attachCount, 2, `expected 2 attachments, found ${attachCount}`);
  });

  await check('every attached tracker is stopped on close', () => {
    const stopCount = source.split('stopProgress();').length - 1;
    assert.strictEqual(stopCount, 2, 'each tracker must be stopped so it cannot outlive the process');
  });

  await check('the tracker is exported for testing', () => {
    assert.strictEqual(typeof trackFFmpegProgress, 'function');
    assert(source.includes('module.exports.trackFFmpegProgress = trackFFmpegProgress'));
  });

  // -------------------------------------------------------------------------
  // 2. Parser behaviour with a fake process (no ffmpeg needed)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. VERIFYING THE PROGRESS PARSER ---');

  await check('turns out_time_us into a percentage of the expected duration', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 100, label: 'Muxing...' });
      proc.push('out_time_us=25000000\nprogress=continue\n');
      assert(h.ticks.length >= 1, 'a tick should have been emitted');
      const last = h.ticks[h.ticks.length - 1];
      assert.strictEqual(last.current, 25);
      assert.strictEqual(last.total, 100);
      assert.strictEqual(last.message, 'Muxing...');
    } finally {
      h.restore();
    }
  });

  await check('treats out_time_ms as microseconds (the FFmpeg naming quirk)', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 50, label: 'Muxing...' });
      proc.push('out_time_ms=10000000\nprogress=continue\n');
      assert(h.ticks.length >= 1, 'expected a tick');
      // 10,000,000 "ms" is really 10s -> 20% of 50s
      assert.strictEqual(h.ticks[h.ticks.length - 1].current, 20,
        'out_time_ms must be divided by 1e6, not 1e3');
    } finally {
      h.restore();
    }
  });

  await check('caps the reported percentage below 100 until the process ends', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 10, label: 'Muxing...' });
      // Claim 30s of a 10s output — must clamp, never overflow the bar.
      proc.push('out_time_us=30000000\nprogress=continue\n');
      assert(h.ticks.length >= 1);
      assert(h.ticks[h.ticks.length - 1].current <= 99,
        'the live bar must never show 100 before completion');
    } finally {
      h.restore();
    }
  });

  await check('is a no-op when the expected duration is unknown', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 0, label: 'Muxing...' });
      proc.push('out_time_us=5000000\nprogress=continue\n');
      assert.strictEqual(h.ticks.length, 0,
        'without a duration there is nothing to compute a ratio against');
    } finally {
      h.restore();
    }
  });

  await check('ignores a malformed progress line', async () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 20, label: 'Muxing...' });
      proc.push('out_time_us=not-a-number\nprogress=continue\n');
      // A garbage value must be dropped entirely — no tick, and never a NaN.
      assert.strictEqual(h.ticks.length, 0, 'a malformed value must not emit a tick');

      proc.push('out_time_us=10000000\nprogress=continue\n');
      assert.strictEqual(h.ticks.length, 1);
      assert.strictEqual(h.ticks[0].current, 50,
        'a valid value after a malformed one must still be parsed');
      assert(!Number.isNaN(h.ticks[0].current), 'NaN leaked into the progress bar');
    } finally {
      h.restore();
    }
  });

  await check('reassembles a progress line split across chunks', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 40, label: 'Muxing...' });
      proc.push('out_time_us=2000');     // split mid-value
      proc.push('0000\nprogress=continue\n');
      assert(h.ticks.length >= 1, 'a split line must still be parsed');
      assert.strictEqual(h.ticks[h.ticks.length - 1].current, 50);
    } finally {
      h.restore();
    }
  });

  await check('throttles to roughly one tick per second', async () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      h.track(proc, { totalDuration: 1000, label: 'Muxing...' });
      // Ten updates inside the same second must collapse to a single tick.
      for (let i = 1; i <= 10; i++) {
        proc.push(`out_time_us=${i * 1000000}\nprogress=continue\n`);
      }
      assert.strictEqual(h.ticks.length, 1,
        `expected the burst to collapse to 1 tick, got ${h.ticks.length}`);
    } finally {
      h.restore();
    }
  });

  await check('stopProgress() halts further reporting', () => {
    const h = withRecordedTicks();
    try {
      const proc = fakeProc();
      const stop = h.track(proc, { totalDuration: 100, label: 'Muxing...' });
      proc.push('out_time_us=10000000\n');
      const before = h.ticks.length;
      stop();
      proc.push('out_time_us=90000000\n');
      assert.strictEqual(h.ticks.length, before, 'no ticks should arrive after stopProgress()');
    } finally {
      h.restore();
    }
  });

  await check('tolerates a process with no stdout stream', () => {
    assert.doesNotThrow(() => {
      const stop = trackFFmpegProgress({}, { totalDuration: 10, label: 'x' });
      assert.strictEqual(typeof stop, 'function');
      stop();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Live ffmpeg smoke test (skipped when spawning is unavailable)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. LIVE FFMPEG SMOKE TEST ---');

  const src = path.join(__dirname, '..', 'storage', 'videos',
    'Part_2_42393141933-1-192_1791277874993.mp4');
  const out = path.join(__dirname, '..', 'storage', 'temp', '_progress_probe.mp4');

  if (!fs.existsSync(src)) {
    console.log('   ⏭️  SKIP: sample video not present');
  } else {
    await new Promise((resolve) => {
      const args = [
        '-y', '-progress', 'pipe:1', '-nostats',
        '-i', src,
        '-t', '20',              // only 20s so the test stays quick
        '-map', '0:v:0', '-map', '0:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        out
      ];
      const proc = spawn('ffmpeg', args);
      const values = [];
      let stderr = '';
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };

      proc.stdout.on('data', (chunk) => {
        for (const line of chunk.toString().split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('out_time_us=')) {
            const micros = parseFloat(trimmed.split('=')[1]);
            if (!isNaN(micros)) values.push(micros / 1e6);
          }
        }
      });
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        console.log(`   ⏭️  SKIP: cannot spawn ffmpeg here (${err.code || err.message})`);
        finish();
      });

      proc.on('close', async (code) => {
        try {
          if (code !== 0) {
            console.log(`   ⚠️  ffmpeg exited ${code}: ${stderr.slice(-200)}`);
          } else {
            await check('ffmpeg actually streams out_time_us during a real mux', () => {
              assert(values.length > 0, 'ffmpeg emitted no progress lines');
              assert(values[values.length - 1] > 0, 'progress never advanced past zero');
            });
          }
        } finally {
          try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch (_) {}
          finish();
        }
      });
    });
  }

  console.log(`\n================================================================`);
  console.log(`   🎉 ALL ${passed} RENDER PROGRESS ASSERTIONS PASSED!`);
  console.log(`================================================================\n`);
})().catch((err) => {
  console.error('\n❌ Render progress test FAILED:\n', err);
  process.exit(1);
});
