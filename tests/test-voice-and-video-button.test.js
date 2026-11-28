/**
 * Test Suite: Combined "Voice + Video" Button (Generate Voice + Generate Video)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n======================================================');
console.log('   ✨ TESTING VOICE + VIDEO COMBINED BUTTON           ');
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

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf-8');

it('public/index.html includes #btn-generate-voice-video with generateVoiceAndVideo()', () => {
  assert.ok(html.includes('id="btn-generate-voice-video"'), 'Must render #btn-generate-voice-video');
  assert.ok(html.includes('onclick="generateVoiceAndVideo()"'), 'Must bind onclick="generateVoiceAndVideo()"');
  assert.ok(html.includes('id="generate-voice-video-text"'), 'Must include #generate-voice-video-text');
});

it('public/index.html places #btn-generate-voice-video right after #btn-generate-video', () => {
  const videoBtnIdx = html.indexOf('id="btn-generate-video"');
  const comboBtnIdx = html.indexOf('id="btn-generate-voice-video"');
  assert.ok(videoBtnIdx > 0 && comboBtnIdx > videoBtnIdx, 'Combo button must follow #btn-generate-video');
});

it('public/js/main.js defines window.generateVoiceAndVideo with pre-flight guards and 2-step flow', () => {
  const fnStart = mainJs.indexOf('window.generateVoiceAndVideo = async function()');
  assert.ok(fnStart > -1, 'Must define window.generateVoiceAndVideo');
  const fnBody = mainJs.slice(fnStart, fnStart + 2500);

  assert.ok(fnBody.includes('state.isGeneratingVoice || state.isGeneratingVideo'), 'Must guard against concurrent runs');
  assert.ok(fnBody.includes('!state.videoUrl'), 'Must validate videoUrl');
  assert.ok(fnBody.includes('executeVoiceGeneration(validItems'), 'Must run executeVoiceGeneration first');
  assert.ok(fnBody.includes('window.generateDubbedVideo()'), 'Must run generateDubbedVideo second');
  assert.ok(
    fnBody.indexOf('executeVoiceGeneration(validItems') < fnBody.indexOf('window.generateDubbedVideo()'),
    'Voice generation must precede video generation'
  );
  assert.ok(fnBody.includes("btnComboText.textContent = 'Voice + Video'"), 'Must restore button label in finally');
});

it('executeVoiceGeneration and generateDubbedVideo also lock #btn-generate-voice-video', () => {
  const execStart = mainJs.indexOf('async function executeVoiceGeneration');
  const execBody = mainJs.slice(execStart, execStart + 1200);
  assert.ok(execBody.includes("document.getElementById('btn-generate-voice-video')"), 'executeVoiceGeneration must reference btn-generate-voice-video');

  const vidStart = mainJs.indexOf('window.generateDubbedVideo = async function()');
  const vidBody = mainJs.slice(vidStart, vidStart + 2000);
  assert.ok(vidBody.includes("document.getElementById('btn-generate-voice-video')"), 'generateDubbedVideo must reference btn-generate-voice-video');
});

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
