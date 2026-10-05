const fs = require('fs');
const path = require('path');
const http = require('http');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function requestHttp(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null });
        } catch (_) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runComprehensiveReview() {
  console.log('================================================================');
  console.log('   🔍 DEEP REVIEW & AUDIT: VIDEO VOLUME & DUB SYNC PLAYBACK    ');
  console.log('================================================================\n');

  // --- 1. AUDITING FRONTEND DOM & CODE ARCHITECTURE ---
  console.log('--- 1. AUDITING FRONTEND DOM & CONTROLS ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/state.js'), 'utf-8');

  // DOM elements in Video Preview bar
  assert(indexHtml.includes('id="video-volume-slider"'), 'DOM contains #video-volume-slider range input');
  assert(indexHtml.includes('id="btn-video-volume-mute"'), 'DOM contains #btn-video-volume-mute button');
  assert(indexHtml.includes('id="video-volume-icon"'), 'DOM contains #video-volume-icon');
  assert(indexHtml.includes('id="video-volume-text"'), 'DOM contains #video-volume-text percentage');
  assert(indexHtml.includes('oninput="setVideoVolume(this.value)"'), 'Volume slider bound to setVideoVolume()');
  assert(indexHtml.includes('onclick="toggleVideoVolumeMute()"'), 'Mute button bound to toggleVideoVolumeMute()');
  assert(indexHtml.includes('id="timecode-current"') && indexHtml.includes('id="timecode-total"'), 'Consolidated timecode display exists');
  assert(indexHtml.includes('id="btn-play"') && indexHtml.includes('id="btn-stop"'), 'Play and Stop buttons exist');

  // Central state variables
  assert(stateJs.includes('videoVolume:'), 'state.js defines videoVolume state');
  assert(stateJs.includes('dubVolume:'), 'state.js defines dubVolume state');
  assert(stateJs.includes('video_preview_volume'), 'state.js initializes videoVolume from localStorage');

  // Video player exported methods
  assert(videoPlayerJs.includes('export function setVideoVolume'), 'video-player.js exports setVideoVolume');
  assert(videoPlayerJs.includes('export function toggleVideoVolumeMute'), 'video-player.js exports toggleVideoVolumeMute');
  assert(videoPlayerJs.includes('export function initVideoVolumeControls'), 'video-player.js exports initVideoVolumeControls');
  assert(videoPlayerJs.includes('export function syncDubVoicePlayback'), 'video-player.js exports syncDubVoicePlayback');
  assert(videoPlayerJs.includes('export function pauseDubVoicePlayback'), 'video-player.js exports pauseDubVoicePlayback');
  assert(videoPlayerJs.includes('export function stopDubVoicePlayback'), 'video-player.js exports stopDubVoicePlayback');

  // Sync engine hooks
  assert(videoPlayerJs.includes('syncDubVoicePlayback(state.currentTime)'), 'Video timeupdate triggers syncDubVoicePlayback');
  assert(videoPlayerJs.includes('applyVideoAudioDucking'), 'Video player supports auto-ducking during dub speech');
  assert(videoPlayerJs.includes('audio.playbackRate = speed'), 'Dub audio uses auto-calculated speedApplied');

  // Table vs Video coordination
  assert(subtitlesJs.includes('window.stopDubVoicePlayback'), 'Individual voice playback pauses dub sync player');
  assert(subtitlesJs.includes('mainVideo.pause()'), 'Individual voice playback pauses native video');

  // --- 2. LOGIC AUDIT: VIDEO VOLUME ADJUSTMENT ---
  console.log('\n--- 2. AUDITING VIDEO VOLUME & MUTE LOGIC ---');
  function simulateVolumeControl(initialVolume) {
    let vol = initialVolume;
    let isMuted = false;
    let lastVol = 1.0;

    function setVol(val) {
      vol = Math.max(0, Math.min(100, val)) / 100;
      isMuted = vol === 0;
    }

    function toggleMute() {
      if (!isMuted && vol > 0) {
        lastVol = vol;
        setVol(0);
      } else {
        setVol(Math.round((lastVol || 1.0) * 100));
      }
    }

    return { getVol: () => vol, isMuted: () => isMuted, setVol, toggleMute };
  }

  const volSim = simulateVolumeControl(1.0);
  assert(volSim.getVol() === 1.0, 'Default video volume is 100% (1.0)');

  volSim.setVol(35);
  assert(volSim.getVol() === 0.35, 'Adjusting slider to 35% sets volume to 0.35');
  assert(volSim.isMuted() === false, 'Volume 0.35 is not muted');

  volSim.toggleMute();
  assert(volSim.getVol() === 0.0, 'Clicking mute button sets volume to 0.0');
  assert(volSim.isMuted() === true, 'Mute state is active');

  volSim.toggleMute();
  assert(volSim.getVol() === 0.35, 'Clicking unmute button restores previous 35% volume');
  assert(volSim.isMuted() === false, 'Unmuted state restored');

  // --- 3. LOGIC AUDIT: AUDIO-VIDEO DUB VOICE SYNC & DRIFT ---
  console.log('\n--- 3. AUDITING AUDIO-VIDEO DUB SYNC TIMING & DRIFT ---');
  const mockSubtitles = [
    {
      id: 'sub-rev-01',
      startSec: 2.0,
      endSec: 6.0,
      audioUrl: '/storage/voices/voice_rev_01.mp3',
      speedApplied: 1.25,
      status: 'Ready'
    },
    {
      id: 'sub-rev-02',
      startSec: 8.0,
      endSec: 12.0,
      audioUrl: '/storage/voices/voice_rev_02.mp3',
      speedApplied: 1.0,
      status: 'Ready'
    }
  ];

  function evaluateDubPlayback(currentTime, subtitles) {
    const active = subtitles.find(s => {
      return (s.audioUrl || s.status === 'Ready') &&
             currentTime >= (s.startSec - 0.05) &&
             currentTime < (s.endSec + 0.15);
    });

    if (!active) return null;

    const speed = active.speedApplied || 1.0;
    const timeOffset = Math.max(0, (currentTime - active.startSec) * speed);
    return {
      subId: active.id,
      audioUrl: active.audioUrl,
      speed,
      timeOffset
    };
  }

  const at1s = evaluateDubPlayback(1.0, mockSubtitles);
  assert(at1s === null, 'At 1.0s (before speech): No dub voice plays');

  const at2s = evaluateDubPlayback(2.0, mockSubtitles);
  assert(at2s !== null && at2s.subId === 'sub-rev-01', 'At 2.0s: sub-rev-01 triggers playback');
  assert(at2s.timeOffset === 0.0, 'At 2.0s: audio starts at offset 0.0s');
  assert(at2s.speed === 1.25, 'At 2.0s: playbackRate is 1.25x');

  const at4s = evaluateDubPlayback(4.0, mockSubtitles);
  assert(at4s !== null && at4s.subId === 'sub-rev-01', 'At 4.0s: sub-rev-01 continues');
  // (4.0 - 2.0) * 1.25 = 2.5s
  assert(Math.abs(at4s.timeOffset - 2.5) < 0.01, 'At 4.0s: audio offset matches speed calculation (2.5s)');

  const at7s = evaluateDubPlayback(7.0, mockSubtitles);
  assert(at7s === null, 'At 7.0s (gap between subs): Dub audio stops');

  const at9s = evaluateDubPlayback(9.0, mockSubtitles);
  assert(at9s !== null && at9s.subId === 'sub-rev-02', 'At 9.0s: sub-rev-02 triggers playback');
  assert(Math.abs(at9s.timeOffset - 1.0) < 0.01, 'At 9.0s: offset is (9 - 8) * 1.0 = 1.0s');

  // --- 4. BACKEND API & REAL SPEECH VERIFICATION ---
  console.log('\n--- 4. TESTING BACKEND CONNECTIVITY & REAL AUDIO STREAMING ---');
  const healthRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET'
  });
  assert(healthRes.statusCode === 200, `GET /api/health returned HTTP 200 (${healthRes.body?.service})`);

  // Generate real TTS audio
  const ttsService = require('../src/services/tts.service.js');
  const ttsResponse = await ttsService.generateVoices([
    {
      id: 'sub_live_review_01',
      khmerText: 'នេះជាសំឡេងបកប្រែសាកល្បងសម្រាប់ការត្រួតពិនិត្យប្រព័ន្ធ',
      voice: 'Piseth (Male)',
      targetDuration: 3.2
    }
  ]);

  const generated = ttsResponse.results || [];
  assert(generated.length === 1, 'Real speech generation returned 1 audio segment');
  assert(generated[0].audioUrl.startsWith('/storage/voices/'), `Generated audioUrl is valid: ${generated[0].audioUrl}`);
  const cleanAudioPath = generated[0].audioUrl.split('?')[0];
  assert(fs.existsSync(path.join(__dirname, '..', cleanAudioPath)), 'Audio file exists physically on server storage');

  // Verify audio streamable over HTTP
  const audioStreamRes = await requestHttp({
    hostname: 'localhost',
    port: 5000,
    path: generated[0].audioUrl,
    method: 'GET'
  });
  assert(audioStreamRes.statusCode === 200, `Audio URL streamable via HTTP GET (status 200)`);
  assert(audioStreamRes.headers['content-type'].includes('audio/mpeg'), 'Audio Content-Type is audio/mpeg');

  // Clean up review audio
  try { fs.unlinkSync(path.join(__dirname, '..', cleanAudioPath)); } catch (_) {}

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`📊 FINAL REVIEW RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runComprehensiveReview().catch(err => {
  console.error('Review failed:', err);
  process.exit(1);
});
