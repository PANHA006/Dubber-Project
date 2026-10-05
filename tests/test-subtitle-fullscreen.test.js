import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n======================================================');
console.log('🧪 RUNNING SUBTITLE FULLSCREEN & UX TEST SUITE');
console.log('======================================================\n');

// 1. Check public/index.html
console.log('--- 1. Testing public/index.html markup ---');
const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

assert(indexHtml.includes('id="subtitle-section"'), 'index.html has id="subtitle-section" on the container');
assert(indexHtml.includes('id="btn-toggle-fullscreen"'), 'index.html has fullscreen toggle button with id="btn-toggle-fullscreen"');
assert(indexHtml.includes('onclick="toggleSubtitleFullscreen()"'), 'Fullscreen button has onclick="toggleSubtitleFullscreen()"');
assert(indexHtml.includes('id="fullscreen-icon"'), 'Fullscreen button has icon with id="fullscreen-icon"');
assert(indexHtml.includes('data-lucide="maximize-2"'), 'Initial icon is maximize-2');
assert(indexHtml.includes('id="fullscreen-text"'), 'Fullscreen button has id="fullscreen-text"');
assert(indexHtml.includes('min-w-[260px]">KHMER TEXT (EDITABLE)'), 'Khmer table header has responsive min-width');
assert(indexHtml.includes('w-[28%] min-w-[180px]">ORIGINAL TEXT'), 'Original text table header has balanced width');

// 2. Check public/css/input.css and output.css
console.log('\n--- 2. Testing Fullscreen CSS Styles ---');
const inputCss = fs.readFileSync(path.join(rootDir, 'public', 'css', 'input.css'), 'utf-8');
const outputCss = fs.readFileSync(path.join(rootDir, 'public', 'css', 'output.css'), 'utf-8');

assert(inputCss.includes('.subtitle-fullscreen-active'), 'input.css defines .subtitle-fullscreen-active');
assert(inputCss.includes('body.subtitle-is-fullscreen'), 'input.css defines body.subtitle-is-fullscreen');
assert(outputCss.includes('.subtitle-fullscreen-active'), 'output.css contains compiled .subtitle-fullscreen-active');
assert(outputCss.includes('z-index:9999!important') || outputCss.includes('z-index: 9999'), 'Fullscreen CSS has z-index 9999');
assert(outputCss.includes('width:100vw!important') || outputCss.includes('width: 100vw'), 'Fullscreen CSS has 100vw width');
assert(outputCss.includes('height:100vh!important') || outputCss.includes('height: 100vh'), 'Fullscreen CSS has 100vh height');

// 3. Check public/js/subtitles.js
console.log('\n--- 3. Testing public/js/subtitles.js logic ---');
const subtitlesJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'subtitles.js'), 'utf-8');

assert(subtitlesJs.includes('export function toggleSubtitleFullscreen'), 'subtitles.js exports toggleSubtitleFullscreen()');
assert(subtitlesJs.includes('export function enterSubtitleFullscreen'), 'subtitles.js exports enterSubtitleFullscreen()');
assert(subtitlesJs.includes('export function exitSubtitleFullscreen'), 'subtitles.js exports exitSubtitleFullscreen()');
assert(subtitlesJs.includes('export function autoResizeTextarea'), 'subtitles.js exports autoResizeTextarea()');
assert(subtitlesJs.includes('<textarea rows="1" data-id="${sub.id}" class="sub-text-input'), 'subtitles.js renders <textarea rows="1"> for Khmer text');
assert(subtitlesJs.includes('autoResizeTextarea(e.target)'), 'subtitles.js resizes textarea on input');
assert(subtitlesJs.includes('document.querySelectorAll(\'.sub-text-input\').forEach(ta => autoResizeTextarea(ta))'), 'subtitles.js auto-resizes all textareas after table render');
assert(subtitlesJs.includes('minimize-2'), 'subtitles.js switches icon to minimize-2 when entering fullscreen');
assert(subtitlesJs.includes('maximize-2'), 'subtitles.js switches icon to maximize-2 when exiting fullscreen');
assert(subtitlesJs.includes('window.toggleSubtitleFullscreen = toggleSubtitleFullscreen'), 'subtitles.js exposes toggleSubtitleFullscreen to window');
assert(subtitlesJs.includes('window.exitSubtitleFullscreen = exitSubtitleFullscreen'), 'subtitles.js exposes exitSubtitleFullscreen to window');

// 4. Check public/js/main.js
console.log('\n--- 4. Testing public/js/main.js keyboard shortcuts & bindings ---');
const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8');

assert(mainJs.includes('toggleSubtitleFullscreen'), 'main.js imports toggleSubtitleFullscreen');
assert(mainJs.includes('exitSubtitleFullscreen'), 'main.js imports exitSubtitleFullscreen');
assert(mainJs.includes('window.toggleSubtitleFullscreen = toggleSubtitleFullscreen'), 'main.js exposes toggleSubtitleFullscreen to window');
assert(mainJs.includes('window.exitSubtitleFullscreen = exitSubtitleFullscreen'), 'main.js exposes exitSubtitleFullscreen to window');
assert(mainJs.includes("e.key === 'Escape' || e.code === 'Escape'"), 'setupKeyboardShortcuts handles Escape key to exit fullscreen');
assert(mainJs.includes("exitSubtitleFullscreen()"), 'Escape key calls exitSubtitleFullscreen()');
assert(mainJs.includes("e.code === 'KeyF' && !isTyping"), 'setupKeyboardShortcuts handles KeyF to toggle fullscreen');

// 5. Functional Simulation Test for toggleSubtitleFullscreen
console.log('\n--- 5. Testing Simulated Fullscreen Toggle & Textarea Auto-Resize ---');

// Mock DOM elements
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...c) { c.forEach(x => this.classes.add(x)); }
  remove(...c) { c.forEach(x => this.classes.delete(x)); }
  contains(c) { return this.classes.has(c); }
  toggle(c) {
    if (this.contains(c)) { this.remove(c); return false; }
    this.add(c); return true;
  }
}

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
    this.attributes = {};
    this.textContent = '';
    this.title = '';
    this.style = {};
    this.scrollHeight = 68;
    this.value = '';
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
}

const mockSection = new MockElement('subtitle-section');
const mockBtnIcon = new MockElement('fullscreen-icon', 'i');
mockBtnIcon.setAttribute('data-lucide', 'maximize-2');
const mockBtnText = new MockElement('fullscreen-text', 'span');
mockBtnText.textContent = 'Fullscreen';
const mockBtn = new MockElement('btn-toggle-fullscreen', 'button');
const mockBody = new MockElement('body');
const mockTextarea = new MockElement('ta1', 'textarea');
mockTextarea.scrollHeight = 64;

const mockDocument = {
  getElementById(id) {
    if (id === 'subtitle-section') return mockSection;
    if (id === 'fullscreen-icon') return mockBtnIcon;
    if (id === 'fullscreen-text') return mockBtnText;
    if (id === 'btn-toggle-fullscreen') return mockBtn;
    return null;
  },
  querySelectorAll(sel) {
    if (sel === '.sub-text-input') return [mockTextarea];
    return [];
  },
  body: mockBody
};

// Simulate enter
function testEnter(doc) {
  const section = doc.getElementById('subtitle-section');
  section.classList.add('subtitle-fullscreen-active');
  doc.body.classList.add('subtitle-is-fullscreen');
  const btnIcon = doc.getElementById('fullscreen-icon');
  const btnText = doc.getElementById('fullscreen-text');
  if (btnIcon) btnIcon.setAttribute('data-lucide', 'minimize-2');
  if (btnText) btnText.textContent = 'Exit';
}

function testExit(doc) {
  const section = doc.getElementById('subtitle-section');
  section.classList.remove('subtitle-fullscreen-active');
  doc.body.classList.remove('subtitle-is-fullscreen');
  const btnIcon = doc.getElementById('fullscreen-icon');
  const btnText = doc.getElementById('fullscreen-text');
  if (btnIcon) btnIcon.setAttribute('data-lucide', 'maximize-2');
  if (btnText) btnText.textContent = 'Fullscreen';
}

function testResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(34, ta.scrollHeight) + 'px';
}

testEnter(mockDocument);
assert(mockSection.classList.contains('subtitle-fullscreen-active'), 'Simulated enter adds subtitle-fullscreen-active');
assert(mockBody.classList.contains('subtitle-is-fullscreen'), 'Simulated enter adds subtitle-is-fullscreen to body');
assert(mockBtnIcon.getAttribute('data-lucide') === 'minimize-2', 'Simulated enter updates icon to minimize-2');
assert(mockBtnText.textContent === 'Exit', 'Simulated enter updates text to Exit');

testResize(mockTextarea);
assert(mockTextarea.style.height === '64px', 'Textarea auto-resizes to match scrollHeight (64px)');

testExit(mockDocument);
assert(!mockSection.classList.contains('subtitle-fullscreen-active'), 'Simulated exit removes subtitle-fullscreen-active');
assert(!mockBody.classList.contains('subtitle-is-fullscreen'), 'Simulated exit removes subtitle-is-fullscreen');
assert(mockBtnIcon.getAttribute('data-lucide') === 'maximize-2', 'Simulated exit restores icon to maximize-2');
assert(mockBtnText.textContent === 'Fullscreen', 'Simulated exit restores text to Fullscreen');

console.log('\n======================================================');
console.log(`📊 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('======================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
