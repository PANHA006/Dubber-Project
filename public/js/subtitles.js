/**
 * Subtitles Management Module: CRUD, Timestamp parsing, SRT Export & Import
 */
import { state } from './state.js';

export function formatTimecodeSRT(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function parseTimecodeSRT(str) {
  if (typeof str === 'number') return Math.max(0, str);
  if (!str || typeof str !== 'string') return 0;

  const trimmed = str.trim();

  // 1. Check standard HH:MM:SS,mmm or HH:MM:SS.mmm
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    const ms = parseInt(hmsMatch[4].padEnd(3, '0').slice(0, 3), 10);
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  // 2. Check MM:SS,mmm or MM:SS.mmm (e.g. 05:41,199)
  const msMatch = trimmed.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (msMatch) {
    const m = parseInt(msMatch[1], 10);
    const s = parseInt(msMatch[2], 10);
    const ms = parseInt(msMatch[3].padEnd(3, '0').slice(0, 3), 10);
    return m * 60 + s + ms / 1000;
  }

  // 3. Check MM:SS without milliseconds (e.g. 05:41 or 5:48)
  const mmssMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (mmssMatch) {
    const m = parseInt(mmssMatch[1], 10);
    const s = parseInt(mmssMatch[2], 10);
    return m * 60 + s;
  }

  // 4. Check HH:MM:SS without milliseconds
  const hmsNoMsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsNoMsMatch) {
    const h = parseInt(hmsNoMsMatch[1], 10);
    const m = parseInt(hmsNoMsMatch[2], 10);
    const s = parseInt(hmsNoMsMatch[3], 10);
    return h * 3600 + m * 60 + s;
  }

  // 5. Check seconds string e.g. "341.2s" or "341.2"
  if (/^\d+(\.\d+)?s?$/i.test(trimmed)) {
    return parseFloat(trimmed) || 0;
  }

  // 6. Fallback colon split
  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const secParts = parts[2].split(/[,.]/);
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(secParts[0], 10) || 0;
    const ms = parseFloat('0.' + (secParts[1] || '0')) || 0;
    return h * 3600 + m * 60 + s + ms;
  } else if (parts.length === 2) {
    const secParts = parts[1].split(/[,.]/);
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(secParts[0], 10) || 0;
    const ms = parseFloat('0.' + (secParts[1] || '0')) || 0;
    return m * 60 + s + ms;
  }

  return 0;
}

export function renderSubtitleTable() {
  const tbody = document.getElementById('subtitle-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!state.subtitles || state.subtitles.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="6" class="py-12 text-center text-slate-500">
        <div class="flex flex-col items-center justify-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400">
            <svg class="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <p class="text-xs font-medium text-slate-400">មិនទាន់មានទិន្នន័យ Subtitles នៅឡើយទេ</p>
          <p class="text-[11px] text-slate-500">សូមបញ្ចូលវីដេអូ រួចចុចប៊ូតុង "Transcribe" ខាងក្រោម ដើម្បីឱ្យ AI បង្កើត Subtitles ដោយស្វ័យប្រវត្តិ</p>
        </div>
      </td>
    `;
    tbody.appendChild(emptyRow);
    state.emit('subtitlesChanged', state.subtitles);
    return;
  }

  state.subtitles.forEach((sub, idx) => {
    const tr = document.createElement('tr');
    tr.className = `group hover:bg-slate-800/40 transition-colors ${sub.selected ? 'bg-indigo-950/20' : ''}`;
    tr.dataset.id = sub.id;

    const isReady = sub.status === 'Ready';

    tr.innerHTML = `
      <td class="py-2.5 px-3 text-center">
        <input type="checkbox" ${sub.selected ? 'checked' : ''} data-id="${sub.id}" class="sub-row-check rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
      </td>
      <td class="py-2 px-2.5 font-mono text-slate-300 text-[11px] w-28">
        <input type="text" value="${sub.start}" data-field="start" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1.5 py-1 w-full font-mono outline-hidden text-xs" />
      </td>
      <td class="py-2 px-2.5 font-mono text-slate-300 text-[11px] w-28">
        <input type="text" value="${sub.end}" data-field="end" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1.5 py-1 w-full font-mono outline-hidden text-xs" />
      </td>
      <td class="py-2 px-3 font-khmer text-slate-100 text-sm">
        <input type="text" value="${escapeHtml(sub.khmerText)}" data-id="${sub.id}" class="sub-text-input w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-2 py-1 outline-hidden font-khmer transition text-sm" />
      </td>
      <td class="py-2 px-3 w-36">
        <div class="relative">
          <select data-id="${sub.id}" class="sub-voice-select w-full bg-[#131a2c] hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer pr-6 focus:border-indigo-500 outline-hidden">
            <option value="Piseth (Male)" ${sub.voice.includes('Male') ? 'selected' : ''}>👨 Piseth (Male)</option>
            <option value="Sreymom (Female)" ${sub.voice.includes('Female') ? 'selected' : ''}>👩 Sreymom (Female)</option>
          </select>
          <svg class="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </td>
      <td class="py-2 px-3 w-28 text-center">
        <span data-id="${sub.id}" class="sub-status-toggle cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
          isReady
            ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900/40'
            : 'bg-amber-950/40 text-amber-400 border border-amber-500/30 hover:bg-amber-900/40'
        }">
          <span>${isReady ? '✓ Ready' : '⌛ Pending'}</span>
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachTableEventListeners();
  state.emit('subtitlesChanged', state.subtitles);
}

function attachTableEventListeners() {
  // Checkbox select
  document.querySelectorAll('.sub-row-check').forEach(cb => {
    cb.onchange = (e) => {
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.selected = e.target.checked;
        const row = e.target.closest('tr');
        if (row) row.classList.toggle('bg-indigo-950/20', sub.selected);
      }
    };
  });

  // Time Inputs
  document.querySelectorAll('.sub-time-input').forEach(input => {
    input.onchange = (e) => {
      const id = e.target.getAttribute('data-id');
      const field = e.target.getAttribute('data-field');
      const val = e.target.value.trim();
      const sub = state.subtitles.find(s => s.id === id);
      if (!sub) return;

      const seconds = parseTimecodeSRT(val);
      sub[field] = formatTimecodeSRT(seconds);
      e.target.value = sub[field];

      if (field === 'start') sub.startSec = seconds;
      if (field === 'end') sub.endSec = seconds;

      state.emit('subtitlesChanged', state.subtitles);
    };
  });

  // Text inputs
  document.querySelectorAll('.sub-text-input').forEach(input => {
    input.oninput = (e) => {
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.khmerText = e.target.value;
        state.emit('activeSubtitleUpdate', state.currentTime);
        state.emit('subtitlesChanged', state.subtitles);
      }
    };
  });

  // Voice dropdown
  document.querySelectorAll('.sub-voice-select').forEach(sel => {
    sel.onchange = (e) => {
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.voice = e.target.value;
        window.showToast?.(`បានប្តូរសំឡេងទៅជា ${sub.voice}`);
      }
    };
  });

  // Status toggle
  document.querySelectorAll('.sub-status-toggle').forEach(badge => {
    badge.onclick = (e) => {
      const id = badge.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.status = sub.status === 'Ready' ? 'Pending' : 'Ready';
        renderSubtitleTable();
        window.showToast?.(`ស្ថានភាព៖ ${sub.status}`);
      }
    };
  });
}

export function addNewSubtitleRow() {
  const last = state.subtitles[state.subtitles.length - 1];
  const startSec = last ? last.endSec + 0.5 : 0;
  const endSec = startSec + 4;

  const newSub = {
    id: 'sub-' + Date.now(),
    selected: false,
    start: formatTimecodeSRT(startSec),
    end: formatTimecodeSRT(endSec),
    startSec: startSec,
    endSec: endSec,
    khmerText: 'អរគុណសម្រាប់ការទស្សនា (សូមបញ្ចូលអក្សរ)',
    voice: 'Piseth (Male)',
    status: 'Pending'
  };

  state.subtitles.push(newSub);
  renderSubtitleTable();
  window.showToast?.('បានបន្ថែមជួរ Subtitle ថ្មី');
}

export function deleteSelectedSubtitles() {
  const beforeLen = state.subtitles.length;
  state.subtitles = state.subtitles.filter(s => !s.selected);
  if (state.subtitles.length === beforeLen) {
    window.showToast?.('សូមជ្រើសរើសជួរ Subtitle ដែលត្រូវលុបជាមុនសិន');
  } else {
    renderSubtitleTable();
    window.showToast?.('បានលុប Subtitle ដែលបានជ្រើសរើស');
  }
}

export function selectAllSubtitles(checked) {
  state.subtitles.forEach(s => s.selected = checked);
  renderSubtitleTable();
}

export function setAllVoices(voiceType) {
  const voiceName = voiceType === 'Male' ? 'Piseth (Male)' : 'Sreymom (Female)';
  state.subtitles.forEach(s => s.voice = voiceName);
  renderSubtitleTable();
  window.showToast?.(`បានកំណត់សំឡេងទាំងអស់ទៅជា៖ ${voiceName}`);
}

/**
 * Real SRT File Export
 * Generates an actual .srt text string and triggers browser file download
 */
export function exportSRTFile(filename = 'subtitles_khmer.srt') {
  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast?.('គ្មានទិន្នន័យ Subtitle សម្រាប់ Export ទេ');
    return;
  }

  let srtContent = '';
  state.subtitles.forEach((sub, index) => {
    srtContent += `${index + 1}\r\n`;
    srtContent += `${sub.start} --> ${sub.end}\r\n`;
    srtContent += `${sub.khmerText.trim()}\r\n\r\n`;
  });

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window.showToast?.(`ទាញយក File ${filename} ជោគជ័យ!`);
}

/**
 * Real SRT File Import
 * Parses an uploaded .srt file into state.subtitles
 */
export function importSRTContent(content) {
  if (!content) return;
  const blocks = content.replace(/\r/g, '').split('\n\n');
  const parsed = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+)/);
      if (timeMatch) {
        const start = timeMatch[1].trim();
        const end = timeMatch[2].trim();
        const text = lines.slice(2).join(' ').trim();
        parsed.push({
          id: 'sub-' + (Date.now() + idx),
          selected: false,
          start: start,
          end: end,
          startSec: parseTimecodeSRT(start),
          endSec: parseTimecodeSRT(end),
          khmerText: text,
          voice: 'Piseth (Male)',
          status: 'Ready'
        });
      }
    }
  });

  if (parsed.length > 0) {
    state.subtitles = parsed;
    renderSubtitleTable();
    window.showToast?.(`បាននាំចូល Subtitle ចំនួន ${parsed.length} ជោគជ័យ!`);
  } else {
    window.showToast?.('ទម្រង់ File SRT មិនត្រឹមត្រូវ');
  }
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
