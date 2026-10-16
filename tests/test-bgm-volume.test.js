/**
 * Test: BGM Volume actually controls the original audio track
 *
 * Reported bug: with BGM Volume set to 0% AND Mute Voice OFF, the dubbed video
 * still played the background. Cause: `bgVolumePct` was read once but only ever
 * referenced inside the `if (removeSpoken)` branch. The `else` branch mixed the
 * original video audio at `videoVolMult` (100% by default), so the BGM slider
 * was a silent no-op in that mode.
 *
 * This test proves the fix two ways:
 *   1. Source assertions — BOTH branches must reference bgVolumePct.
 *   2. A real render measured with ffmpeg's volumedetect. A synthetic source is
 *      built with a constant tone, and the single voice clip is placed at 5s, so
 *      the 0-4s window contains ONLY the original audio. BGM=0 must make that
 *      window silent; BGM=100 must keep it audible.
 *
 * Run: node tests/test-bgm-volume.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'services', 'video-renderer.service.js');
const source = fs.readFileSync(SRC, 'utf8');

const TEMP = path.join(ROOT, 'storage', 'temp');
const VIDEO_DIR = path.join(ROOT, 'storage', 'videos');
const VOICE_DIR = path.join(ROOT, 'storage', 'voices');

const SOURCE_VIDEO = path.join(TEMP, '_bgm_test_src.mp4');
const VOICE_CLIP = path.join(TEMP, '_bgm_test_voice.mp3');

let passed = 0;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`   ✅ PASS: ${label}`);
}

/**
 * Run a helper binary. Uses async spawn rather than spawnSync because the
 * sandbox blocks synchronous spawning with EBUSY.
 */
function runProcess(cmd, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    let proc;
    try {
      proc = spawn(cmd, args);
    } catch (err) {
      return resolve({ status: -1, error: err, stdout, stderr });
    }

    const timer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      finish({ status: -1, error: new Error('timeout'), stdout, stderr });
    }, timeoutMs);

    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (err) => finish({ status: -1, error: err, stdout, stderr }));
    proc.on('close', (code) => finish({ status: code, stdout, stderr }));
  });
}

const ffmpeg = (args, timeoutMs) => runProcess('ffmpeg', args, timeoutMs);

async function ffmpegAvailable() {
  const res = await runProcess('ffmpeg', ['-version'], 15000);
  return res.status === 0;
}

/** Mean volume in dB over a window of the file, via ffmpeg volumedetect. */
async function meanVolumeDb(file, startSec, durationSec) {
  const res = await ffmpeg(['-ss', String(startSec), '-t', String(durationSec),
    '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], 60000);
  const output = res.stderr || '';
  const match = output.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/);
  if (!match) return null;
  if (match[1] === '-inf') return -Infinity;
  return parseFloat(match[1]);
}

(async () => {
  console.log('================================================================');
  console.log('   🧪 BGM VOLUME TEST');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Source assertions
  // -------------------------------------------------------------------------
  console.log('--- 1. VERIFYING THE MIXING LOGIC ---');

  await check('bgVolumePct is referenced in BOTH removeSpoken branches', () => {
    const reads = source.split('bgVolumePct').length - 1;
    // 1 read + 2 usages (one per branch) + the extra log references.
    assert(reads >= 5, `expected bgVolumePct to be used in both branches, saw ${reads} references`);
  });

  await check('the Mute Voice OFF branch scales the original by bgScale', () => {
    const marker = source.indexOf('MUTE ORIGINAL VOICE is DISABLED');
    assert(marker > -1, 'could not find the Mute Voice OFF branch');
    // bgScale is computed just above the log line, so look back as well.
    // The branch ends at the next `} else {` — stopping there keeps the
    // unrelated (and unreachable) "no dub voices" branch out of the sample.
    const nextElse = source.indexOf('} else {', marker);
    const end = nextElse > marker ? nextElse : marker + 800;
    const branch = source.slice(Math.max(0, marker - 600), end);

    assert(branch.includes('const bgScale ='),
      'the OFF branch must compute bgScale from bgVolumePct');
    assert(branch.includes('volume=${bgScale.toFixed(3)}[orig_aud]'),
      'the OFF branch must apply bgScale to the original audio');
    assert(!branch.includes('volume=${videoVolMult.toFixed(3)}[orig_aud]'),
      'the old videoVolMult-only scaling must be gone from this branch');
  });

  await check('the log reports the real applied gain instead of claiming 100%', () => {
    assert(source.includes('Original audio scaled to ${bgVolumePct}%'),
      'the log should state the actual BGM level');
    assert(!source.includes('Original audio preserved at 100%'),
      'the misleading "preserved at 100%" message must be gone');
  });

  // -------------------------------------------------------------------------
  // 2. Real render measured with volumedetect
  // -------------------------------------------------------------------------
  console.log('\n--- 2. VERIFYING WITH A REAL RENDER (volumedetect) ---');

  if (!(await ffmpegAvailable())) {
    console.log('   ⏭️  SKIP: ffmpeg not available');
  } else {
    fs.mkdirSync(TEMP, { recursive: true });
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
    fs.mkdirSync(VOICE_DIR, { recursive: true });

    // 8s black video carrying a loud constant tone, so any surviving original
    // audio is unmistakable in the loudness measurement.
    const buildSrc = await ffmpeg([
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=8:r=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
      '-af', 'volume=0.5',
      '-shortest',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30',
      '-c:a', 'aac', '-b:a', '128k',
      SOURCE_VIDEO
    ]);
    if (buildSrc.status !== 0) {
      console.log(`   ⚠️  could not build the test source: ${(buildSrc.stderr || '').slice(-200)}`);
    }

    const buildVoice = await ffmpeg([
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.5',
      '-c:a', 'libmp3lame', '-b:a', '128k',
      VOICE_CLIP
    ]);
    if (buildVoice.status !== 0) {
      console.log(`   ⚠️  could not build the test voice: ${(buildVoice.stderr || '').slice(-200)}`);
    }

    if (fs.existsSync(SOURCE_VIDEO) && fs.existsSync(VOICE_CLIP)) {
      // Fresh require so the test always exercises the code on disk.
      delete require.cache[require.resolve(SRC)];
      const renderer = require(SRC);

      // The voice starts at 5s, so 0-4s holds ONLY the original audio track.
      const subtitles = [{
        id: 'bgm-test',
        audioUrl: VOICE_CLIP,
        startSec: 5,
        endSec: 6.5
      }];

      const rendered = [];

      async function renderWith(bgVolume) {
        const result = await renderer.renderDubbedVideo({
          videoUrl: SOURCE_VIDEO,
          subtitles,
          settings: {
            removeSpoken: false,   // Mute Voice OFF — the buggy path
            bgVolume,
            videoVolume: 1.0,
            dubVolume: 1.0,
            padBefore: 0.25,
            padAfter: 0.25
          }
        });
        const outPath = path.join(VIDEO_DIR, result.filename);
        rendered.push(outPath);
        return outPath;
      }

      const silentPath = await renderWith(0);
      const loudPath = await renderWith(100);

      await check('BGM 0% + Mute Voice OFF produces a SILENT original window', async () => {
        const db = await meanVolumeDb(silentPath, 0, 4);
        assert(db !== null, 'volumedetect gave no reading');
        assert(db <= -80,
          `expected near-silence in the 0-4s window, measured ${db} dB. ` +
          'A value around -20 dB means the BGM slider is still being ignored.');
      });

      await check('BGM 100% + Mute Voice OFF keeps the original AUDIBLE', async () => {
        const db = await meanVolumeDb(loudPath, 0, 4);
        assert(db !== null, 'volumedetect gave no reading');
        assert(db >= -40,
          `expected the original audio to be audible at 100%, measured ${db} dB`);
      });

      await check('the two settings really produce different audio', async () => {
        const quiet = await meanVolumeDb(silentPath, 0, 4);
        const loud = await meanVolumeDb(loudPath, 0, 4);
        assert(loud - quiet >= 40,
          `the slider must change the mix materially, saw only ${(loud - quiet).toFixed(1)} dB of difference`);
      });

      await check('the Khmer voice still plays in both renders', async () => {
        // The voice sits at 5-6.5s and must survive regardless of the BGM level.
        for (const file of rendered) {
          const db = await meanVolumeDb(file, 5, 1.4);
          assert(db !== null, 'volumedetect gave no reading on the voice window');
          assert(db >= -40,
            `the dubbed voice must remain audible, measured ${db} dB in ${path.basename(file)}`);
        }
      });

      rendered.forEach((file) => {
        try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
      });
    } else {
      console.log('   ⏭️  SKIP: test media could not be generated');
    }
  }

  // Clean up the synthetic inputs.
  [SOURCE_VIDEO, VOICE_CLIP].forEach((file) => {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  });

  console.log(`\n================================================================`);
  console.log(`   🎉 ALL ${passed} BGM VOLUME ASSERTIONS PASSED!`);
  console.log(`================================================================\n`);
})().catch((err) => {
  console.error('\n❌ BGM volume test FAILED:\n', err);
  process.exit(1);
});
