import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n================================================================');
console.log('📏 VERIFYING NAVBAR TOOLBAR BUTTON HEIGHT EQUALITY (h-8 / 32px)');
console.log('================================================================\n');

const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8').replace(/\r\n/g, '\n');
const mainJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'main.js'), 'utf-8').replace(/\r\n/g, '\n');

// 1. Settings button (the default reference)
const settingsBtnMatch = html.match(/<button onclick="openSettingsModal\(\)"[^>]*class="([^"]*)"/);
assert(settingsBtnMatch && settingsBtnMatch[1].includes('h-8'), 'Settings gear button has default height class "h-8" (32px)');
assert(settingsBtnMatch && settingsBtnMatch[1].includes('w-8'), 'Settings gear button is square 32x32px ("w-8")');

// 2. Auto-Saved badge
const autoSaveMatch = html.match(/<div id="autosave-badge"[^>]*class="([^"]*)"/);
assert(autoSaveMatch && autoSaveMatch[1].includes('h-8'), 'Auto-Saved badge has height class "h-8" (32px)');
assert(autoSaveMatch && autoSaveMatch[1].includes('rounded-lg'), 'Auto-Saved badge has rounded-lg');

// 3. Server health badge in HTML
const serverBadgeMatch = html.match(/<div id="server-badge"[^>]*class="([^"]*)"/);
assert(serverBadgeMatch && serverBadgeMatch[1].includes('h-8'), 'Server health badge has height class "h-8" in index.html (32px)');

// 4. Server health badge in main.js (dynamic className)
assert(mainJs.includes('badge.className = "h-8 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 rounded-lg bg-emerald-950/50'), 'Online badge state preserves "h-8" in main.js');
assert(mainJs.includes('badge.className = "h-8 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 rounded-lg bg-amber-950/50'), 'Offline badge state preserves "h-8" in main.js');

// 5. Verification of removed items from navbar
assert(!html.includes('id="folder-menu-btn"'), 'Folder menu button cleanly removed from navbar');
assert(!html.includes('title="Undo"'), 'Undo button cleanly removed from navbar');
assert(!html.includes('title="Redo"'), 'Redo button cleanly removed from navbar');
assert(!html.includes('id="lang-km"'), 'Language switcher cleanly removed from navbar');
assert(html.includes('onclick="triggerSRTUpload()"'), 'Import SRT button safely preserved in Subtitles toolbar');

// 8. Export Video CTA button
const exportBtnMatch = html.match(/<button id="btn-export-video"[^>]*class="([^"]*)"/);
assert(exportBtnMatch && exportBtnMatch[1].includes('h-8'), 'Export Video CTA button has height class "h-8" (32px)');

// 9. Data History button
const historyBtnMatch = html.match(/<button id="btn-data-history"[^>]*class="([^"]*)"/);
assert(historyBtnMatch && historyBtnMatch[1].includes('h-8'), 'Data History button has height class "h-8" (32px)');

console.log('\n================================================================');
console.log(`📊 RESULT: ${passedChecks}/${totalChecks} Checks Passed (${Math.round((passedChecks / totalChecks) * 100)}%)`);
console.log('================================================================\n');

if (passedChecks === totalChecks) {
  process.exit(0);
} else {
  process.exit(1);
}
