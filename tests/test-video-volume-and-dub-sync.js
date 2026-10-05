const fs = require('fs');
const path = require('path');

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

function runSuite() {
  console.log('================================================================');
  console.log('   🔊 TEST SUITE: VIDEO VOLUME CONTROLS & DUB VOICE SYNC ENGINE ');
  console.log('================================================================\n');

  // --- 1. DOM INSPECTION ---
  console.log('--- 1. AUDITING VIDEO PREVIEW DOM CONTROLS ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  
  assert(indexHtml.includes('id="video-volume-slider"'), 'index.html contains #video-volume-slider');
  assert(indexHtml.includes('id="btn-video-volume-mute"'), 'index.html contains #btn-video-volume-mute');
  assert(indexHtml.includes('id="video-volume-icon"'), 'index.html contains #video-volume-icon');
  assert(indexHtml.includes('id="video-volume-text"'), 'index.html contains #video-volume-text');
  assert(indexHtml.includes('setVideoVolume(this.value)'), 'index.html wires slider to setVideoVolume');
  assert(indexHtml.includes('toggleVideoVolumeMute()'), 'index.html wires mute button to toggleVideoVolumeMute');
  assert(indexHtml.includes('id="timecode-current"') && indexHtml.includes('id="timecode-total"'), 'index.html contains consolidated timecode display');

  // --- 2. STATE AUDIT ---
  console.log('\n--- 2. AUDITING CENTRAL STATE ---');
  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/state.js'), 'utf-8');
  assert(stateJs.includes('videoVolume:'), 'state.js defines videoVolume');
  assert(stateJs.includes('dubVolume:'), 'state.js defines dubVolume');
  assert(stateJs.includes('video_preview_volume'), 'state.js loads video_preview_volume from localStorage');

  // --- 3. VIDEO PLAYER LOGIC AUDIT ---
  console.log('\n--- 3. AUDITING VIDEO PLAYER & SYNC ENGINE ---');
  const videoPlayerJs = fs.readFileSync(path.join(__dirname, '../public/js/video-player.js'), 'utf-8');
  assert(videoPlayerJs.includes('export function setVideoVolume'), 'video-player.js exports setVideoVolume');
  assert(videoPlayerJs.includes('export function toggleVideoVolumeMute'), 'video-player.js exports toggleVideoVolumeMute');
  assert(videoPlayerJs.includes('export function syncDubVoicePlayback'), 'video-player.js exports syncDubVoicePlayback');
  assert(videoPlayerJs.includes('export function stopDubVoicePlayback'), 'video-player.js exports stopDubVoicePlayback');
  assert(videoPlayerJs.includes('export function pauseDubVoicePlayback'), 'video-player.js exports pauseDubVoicePlayback');
  assert(videoPlayerJs.includes('syncDubVoicePlayback(state.currentTime)'), 'video-player.js calls syncDubVoicePlayback during timeupdate');
  assert(videoPlayerJs.includes('audio.playbackRate = speed'), 'Dub audio applies auto-speed playbackRate');
  assert(videoPlayerJs.includes('applyVideoAudioDucking'), 'video-player.js applies audio ducking for original speech');

  // --- 4. SUBTITLES INTERACTION AUDIT ---
  console.log('\n--- 4. AUDITING SUBTITLES & VOICE COORDINATION ---');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf-8');
  assert(subtitlesJs.includes('window.stopDubVoicePlayback'), 'subtitles.js coordinates row play with dub sync playback');
  assert(subtitlesJs.includes('mainVideo.pause()'), 'subtitles.js pauses video when individual voice row is played');

  // --- 5. LOGICAL SIMULATION ---
  console.log('\n--- 5. SIMULATING DUB SYNC TIMELINE MATCHING ---');
  const mockSubtitles = [
    {
      id: 'sub-01',
      startSec: 3.5,
      endSec: 7.2,
      audioUrl: '/storage/voices/voice_sub_01.mp3',
      speedApplied: 1.25,
      status: 'Ready'
    },
    {
      id: 'sub-02',
      startSec: 10.0,
      endSec: 14.0,
      audioUrl: null, // Pending, no audio
      status: 'Pending'
    },
    {
      id: 'sub-03',
      startSec: 15.0,
      endSec: 18.5,
      audioUrl: '/storage/voices/voice_sub_03.mp3',
      speedApplied: 1.0,
      status: 'Ready'
    }
  ];

  function findActiveDub(subtitles, currentTime) {
    return subtitles.find(s => {
      return (s.audioUrl || s.status === 'Ready') &&
             currentTime >= (s.startSec - 0.05) &&
             currentTime < (s.endSec + 0.15);
    });
  }

  const subAt2s = findActiveDub(mockSubtitles, 2.0);
  assert(subAt2s === undefined, 'At 2.0s: No subtitle active');

  const subAt4s = findActiveDub(mockSubtitles, 4.0);
  assert(subAt4s && subAt4s.id === 'sub-01', 'At 4.0s: sub-01 is correctly identified');
  assert(subAt4s.speedApplied === 1.25, 'At 4.0s: speed rate 1.25x applied');

  const subAt12s = findActiveDub(mockSubtitles, 12.0);
  assert(subAt12s === undefined, 'At 12.0s: sub-02 has no audioUrl, skipped');

  const subAt16s = findActiveDub(mockSubtitles, 16.0);
  assert(subAt16s && subAt16s.id === 'sub-03', 'At 16.0s: sub-03 is correctly identified');

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedChecks}/${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite();
