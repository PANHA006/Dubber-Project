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

/**
 * Smart Non-Overlapping End Padding
 * Automatically extends each subtitle's end time by `endPadding` seconds,
 * while strictly guaranteeing that the end time does not collide or overlap with the next row.
 * A safety buffer of 0.05s (50ms) is maintained before the next row's start time.
 *
 * @param {Array} subtitles - List of subtitle objects
 * @param {number} endPadding - Extra seconds to add to end time (e.g. 0.70)
 * @param {number} videoDuration - Optional total video duration in seconds
 * @returns {Array} Updated subtitles list
 */
export function applySmartEndPadding(subtitles, endPadding = 0.70, videoDuration = 0) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return subtitles || [];
  }

  const pad = Math.max(0, Number(endPadding) || 0);
  const SAFETY_GAP = 0.05; // 50ms buffer to prevent speech overlapping next row
  const n = subtitles.length;

  for (let i = 0; i < n; i++) {
    const sub = subtitles[i];
    const rawStart = typeof sub.startSec === 'number' ? sub.startSec : parseTimecodeSRT(sub.start);
    const rawEnd = typeof sub.endSec === 'number' ? sub.endSec : parseTimecodeSRT(sub.end);

    let nextStart;
    if (i < n - 1) {
      const nextSub = subtitles[i + 1];
      nextStart = typeof nextSub.startSec === 'number' ? nextSub.startSec : parseTimecodeSRT(nextSub.start);
    } else {
      // Last row: bound by videoDuration if valid and larger than rawEnd
      if (videoDuration && videoDuration > rawEnd) {
        nextStart = videoDuration;
      } else {
        nextStart = rawEnd + pad + 1.0;
      }
    }

    const availableGap = nextStart - rawEnd;
    let newEnd = rawEnd;

    if (availableGap > SAFETY_GAP) {
      const maxAllowed = Math.max(0, availableGap - SAFETY_GAP);
      const paddingToAdd = Math.min(pad, maxAllowed);
      newEnd = rawEnd + paddingToAdd;
    } else if (rawEnd > nextStart) {
      // Avoid existing collision from noisy segment boundaries
      newEnd = Math.max(rawStart, nextStart - SAFETY_GAP);
    }

    // Round to 3 decimal places (milliseconds)
    sub.startSec = Math.round(rawStart * 1000) / 1000;
    sub.endSec = Math.round(newEnd * 1000) / 1000;
    sub.start = formatTimecodeSRT(sub.startSec);
    sub.end = formatTimecodeSRT(sub.endSec);
  }

  return subtitles;
}

let currentPlayingAudio = null;
let currentPlayingSubId = null;

export function stopVoicePlayback() {
  if (currentPlayingAudio) {
    currentPlayingAudio.pause();
    currentPlayingAudio.currentTime = 0;
    currentPlayingAudio = null;
    currentPlayingSubId = null;
    renderSubtitleTable();
  }
}

export function playVoice(subId) {
  const sub = state.subtitles.find(s => s.id === subId);
  if (!sub) return;

  // Toggle pause if currently playing this row
  if (currentPlayingSubId === subId && currentPlayingAudio && !currentPlayingAudio.paused) {
    currentPlayingAudio.pause();
    currentPlayingAudio.currentTime = 0;
    currentPlayingSubId = null;
    currentPlayingAudio = null;
    renderSubtitleTable();
    return;
  }

  // Stop any other active audio and dub playback
  if (currentPlayingAudio) {
    currentPlayingAudio.pause();
    currentPlayingAudio.currentTime = 0;
    currentPlayingAudio = null;
    currentPlayingSubId = null;
  }
  if (window.stopDubVoicePlayback) {
    window.stopDubVoicePlayback();
  }

  // Pause video if currently playing
  const mainVideo = document.getElementById('main-video');
  if (mainVideo && !mainVideo.paused) {
    mainVideo.pause();
    state.isPlaying = false;
    const playIcon = document.getElementById('play-icon');
    if (playIcon) playIcon.setAttribute('data-lucide', 'play');
    if (window.lucide) window.lucide.createIcons();
  }

  const audioUrl = sub.audioUrl || `/storage/voices/voice_${String(sub.id).replace(/[:/\\\s]/g, '_')}.mp3`;
  const audio = new Audio(audioUrl);
  // Audio file has already been tempo-adjusted by backend FFmpeg if needed
  audio.playbackRate = 1.0;
  currentPlayingAudio = audio;
  currentPlayingSubId = subId;
  renderSubtitleTable();

  audio.play().catch((err) => {
    console.error('Audio playback error:', err);
    window.showToast?.('⚠️ មិនអាចចាក់សំឡេងបានទេ (ឯកសារមិនទាន់មាន ឬបរាជ័យ)');
    currentPlayingSubId = null;
    currentPlayingAudio = null;
    renderSubtitleTable();
  });

  audio.onended = () => {
    currentPlayingSubId = null;
    currentPlayingAudio = null;
    renderSubtitleTable();
  };
};

export function renderSubtitleTable() {
  const tbody = document.getElementById('subtitle-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!state.subtitles || state.subtitles.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="7" class="py-12 text-center text-slate-500">
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
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  state.subtitles.forEach((sub, idx) => {
    const tr = document.createElement('tr');
    tr.className = `group hover:bg-slate-800/40 transition-colors ${sub.selected ? 'bg-indigo-950/20' : ''}`;
    tr.dataset.id = sub.id;

    const isModified = sub.status === 'Modified' || sub.needsRegenerate;
    const isReady = (sub.status === 'Ready' || sub.audioUrl) && !isModified;

    tr.innerHTML = `
      <td class="py-2.5 px-3 text-center">
        <input type="checkbox" ${sub.selected ? 'checked' : ''} data-id="${sub.id}" class="sub-row-check rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
      </td>
      <td class="py-2 px-2.5 font-mono text-slate-300 text-[11px] w-24">
        <input type="text" value="${sub.start}" data-field="start" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1.5 py-1 w-full font-mono outline-hidden text-xs" />
      </td>
      <td class="py-2 px-2.5 font-mono text-slate-300 text-[11px] w-24">
        <input type="text" value="${sub.end}" data-field="end" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1.5 py-1 w-full font-mono outline-hidden text-xs" />
      </td>
      <td class="py-2 px-3 text-slate-300 text-xs">
        <input type="text" value="${escapeHtml(sub.originalText || '')}" data-id="${sub.id}" class="sub-original-text-input w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 focus:border-indigo-500/60 border border-transparent rounded px-2 py-1 outline-hidden text-slate-300 transition text-xs placeholder:text-slate-600" placeholder="Original speech..." />
        ${
          sub.englishText
            ? `<div class="text-[10.5px] text-cyan-400 font-sans mt-0.5 px-1 truncate flex items-center gap-1 opacity-90 hover:opacity-100 transition" title="English Pivot: ${escapeHtml(sub.englishText)}">
                <span class="text-[9px] font-bold font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">EN</span>
                <span class="truncate">${escapeHtml(sub.englishText)}</span>
              </div>`
            : ''
        }
      </td>
      <td class="py-2 px-3 font-khmer text-slate-100 text-sm">
        <textarea rows="1" data-id="${sub.id}" class="sub-text-input w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-2 py-1 outline-hidden font-khmer transition text-sm resize-none overflow-hidden leading-relaxed block" placeholder="បញ្ចូលអត្ថបទបកប្រែខ្មែរ..." title="${escapeHtml(sub.khmerText || '')}">${escapeHtml(sub.khmerText || '')}</textarea>
      </td>
      <td class="py-2 px-3 w-40">
        <div class="relative">
          <select data-id="${sub.id}" class="sub-voice-select w-full bg-[#131a2c] hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer pr-6 focus:border-indigo-500 outline-hidden">
            <optgroup label="Default (Edge TTS)">
              <option value="Piseth (Male)" ${(!sub.voice || sub.voice.includes('Piseth') || (sub.voice.includes('Male') && !sub.voice.includes('RVC'))) ? 'selected' : ''}>👨 Piseth (Male)</option>
              <option value="Sreymom (Female)" ${(sub.voice && sub.voice.includes('Female') && !sub.voice.includes('RVC')) ? 'selected' : ''}>👩 Sreymom (Female)</option>
            </optgroup>
            ${(state.rvcModels && state.rvcModels.length > 0) ? `
              <optgroup label="🎭 Character Voices (RVC)">
                ${state.rvcModels.map(m => `
                  <option value="${m.id}" ${sub.voice === m.id || sub.voice === m.name || sub.voice === `🎭 ${m.name} (RVC)` ? 'selected' : ''}>🎭 ${escapeHtml(m.name)}</option>
                `).join('')}
              </optgroup>
            ` : ''}
          </select>
          <svg class="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </td>
      <td class="py-2 px-3 w-28 text-center">
        ${
          isReady
            ? `
            <div class="inline-flex items-center gap-1.5">
              <button onclick="window.playVoice('${sub.id}')"
                title="ចុចដើម្បីស្តាប់សំឡេង AI (${sub.voice}${sub.speedApplied > 1.04 ? ' | ល្បឿន ' + sub.speedApplied + 'x' : ''})"
                class="sub-voice-play-btn inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg ${
                  currentPlayingSubId === sub.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-emerald-400'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300'
                } font-medium text-xs transition active:scale-95 cursor-pointer">
                <i data-lucide="${currentPlayingSubId === sub.id ? 'pause' : 'volume-2'}" class="w-3.5 h-3.5 ${currentPlayingSubId === sub.id ? 'animate-bounce' : ''}"></i>
                <span class="text-[11px] font-mono font-bold">${currentPlayingSubId === sub.id ? 'Playing' : 'Play'}</span>
              </button>
              ${
                sub.speedApplied && sub.speedApplied > 1.04
                  ? `<span class="text-[10px] font-mono px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold" title="Auto-Speed: បានបង្កើនល្បឿន ${sub.speedApplied}x ដើម្បីតម្រូវតាមពេលវេលា Start/End">⚡${sub.speedApplied}x</span>`
                  : ''
              }
            </div>
            `
            : isModified
            ? `
            <div class="inline-flex items-center gap-1.5">
              <button onclick="window.playVoice('${sub.id}')"
                title="អត្ថបទត្រូវបានកែប្រែ (សូមចុច Re-Generate Voice ខាងក្រោម)"
                class="sub-voice-play-btn inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg ${
                  currentPlayingSubId === sub.id
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 hover:text-amber-300'
                } font-medium text-xs transition active:scale-95 cursor-pointer">
                <i data-lucide="${currentPlayingSubId === sub.id ? 'pause' : 'volume-2'}" class="w-3.5 h-3.5 ${currentPlayingSubId === sub.id ? 'animate-bounce' : 'text-amber-400'}"></i>
                <span class="text-[11px] font-mono font-bold">${currentPlayingSubId === sub.id ? 'Playing' : 'Play'}</span>
              </button>
              ${
                sub.speedApplied && sub.speedApplied > 1.04
                  ? `<span class="text-[10px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold" title="Auto-Speed: ${sub.speedApplied}x">⚡${sub.speedApplied}x</span>`
                  : ''
              }
            </div>
            `
            : `
            <div title="មិនទាន់មានសំឡេង (សូមចុច Generate Voice ខាងក្រោម)"
              class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-500 opacity-40 cursor-not-allowed select-none">
              <i data-lucide="volume-2" class="w-3.5 h-3.5 text-slate-500"></i>
              <span class="text-[11px] font-medium text-slate-500">Pending</span>
            </div>
            `
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachTableEventListeners();
  document.querySelectorAll('.sub-text-input').forEach(ta => autoResizeTextarea(ta));
  if (window.lucide) window.lucide.createIcons();
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
        state.emit('subtitlesChanged', state.subtitles);
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

  // Original text inputs
  document.querySelectorAll('.sub-original-text-input').forEach(input => {
    input.oninput = (e) => {
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.originalText = e.target.value;
        state.emit('subtitlesChanged', state.subtitles);
      }
    };
  });

  // Khmer text inputs: Auto-Check row & Turn sound icon to Yellow on change
  document.querySelectorAll('.sub-text-input').forEach(input => {
    input.oninput = (e) => {
      autoResizeTextarea(e.target);
      e.target.title = e.target.value;
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        sub.khmerText = e.target.value;

        // Auto-check this row
        sub.selected = true;

        // If row was Ready or has generated audio, mark as Modified (yellow sound)
        if (sub.status === 'Ready' || sub.audioUrl) {
          sub.status = 'Modified';
          sub.needsRegenerate = true;
          if (!sub.oldAudioUrl && sub.audioUrl) {
            sub.oldAudioUrl = sub.audioUrl;
          }
        }

        // Live update DOM row without full re-render (preserves input focus!)
        const row = e.target.closest('tr');
        if (row) {
          row.classList.add('bg-indigo-950/20');
          const cb = row.querySelector('.sub-row-check');
          if (cb) cb.checked = true;

          // Turn sound button to yellow if modified
          if (sub.status === 'Modified') {
            const soundTd = row.querySelector('td:last-child');
            if (soundTd && !soundTd.querySelector('.text-amber-400')) {
              soundTd.innerHTML = `
                <button onclick="window.playVoice('${sub.id}')"
                  title="អត្ថបទត្រូវបានកែប្រែ (សូមចុច Re-Generate Voice ខាងក្រោម)"
                  class="sub-voice-play-btn inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 hover:text-amber-300 font-medium text-xs transition active:scale-95 cursor-pointer">
                  <i data-lucide="volume-2" class="w-3.5 h-3.5 text-amber-400"></i>
                  <span class="text-[11px] font-mono font-bold">Play</span>
                </button>
              `;
              if (window.lucide) window.lucide.createIcons();
            }
          }
        }

        state.emit('activeSubtitleUpdate', state.currentTime);
        state.emit('subtitlesChanged', state.subtitles);
      }
    };
  });

  // Voice dropdown: Auto-check and turn sound to yellow if modified
  document.querySelectorAll('.sub-voice-select').forEach(sel => {
    sel.onchange = (e) => {
      const id = e.target.getAttribute('data-id');
      const sub = state.subtitles.find(s => s.id === id);
      if (sub) {
        if (sub.voice !== e.target.value) {
          sub.voice = e.target.value;
          sub.selected = true;
          if (sub.status === 'Ready' || sub.audioUrl) {
            sub.status = 'Modified';
            sub.needsRegenerate = true;
            if (!sub.oldAudioUrl && sub.audioUrl) {
              sub.oldAudioUrl = sub.audioUrl;
            }
          }
          renderSubtitleTable();
          state.emit('subtitlesChanged', state.subtitles);
          window.showToast?.(`បានប្តូរសំឡេងទៅជា ${sub.voice}`);
        }
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
    originalText: 'Original text (speech)',
    khmerText: 'អរគុណសម្រាប់ការទស្សនា (សូមបញ្ចូលអក្សរ)',
    voice: 'Piseth (Male)',
    status: 'Pending'
  };

  state.subtitles.push(newSub);
  renderSubtitleTable();
  state.emit('subtitlesChanged', state.subtitles);
  window.showToast?.('បានបន្ថែមជួរ Subtitle ថ្មី');
}

export function deleteSelectedSubtitles() {
  const beforeLen = state.subtitles.length;
  stopVoicePlayback();
  state.subtitles = state.subtitles.filter(s => !s.selected);
  if (state.subtitles.length === beforeLen) {
    window.showToast?.('សូមជ្រើសរើសជួរ Subtitle ដែលត្រូវលុបជាមុនសិន');
  } else {
    renderSubtitleTable();
    state.emit('subtitlesChanged', state.subtitles);
    window.showToast?.('បានលុប Subtitle ដែលបានជ្រើសរើស');
  }
}

export function selectAllSubtitles(checked) {
  state.subtitles.forEach(s => s.selected = checked);
  renderSubtitleTable();
  state.emit('subtitlesChanged', state.subtitles);
}

export function setAllVoices(voiceType) {
  let voiceName = voiceType;
  if (voiceType === 'Male') voiceName = 'Piseth (Male)';
  else if (voiceType === 'Female') voiceName = 'Sreymom (Female)';
  else {
    const matched = (state.rvcModels || []).find(m => m.id === voiceType || m.name === voiceType);
    if (matched) voiceName = matched.id;
  }
  stopVoicePlayback();
  state.subtitles.forEach(s => {
    if (s.voice !== voiceName) {
      s.voice = voiceName;
      s.status = 'Pending';
      s.audioUrl = null;
    }
  });
  renderSubtitleTable();
  state.emit('subtitlesChanged', state.subtitles);
  const displayName = (state.rvcModels || []).find(m => m.id === voiceName)?.name || voiceName;
  window.showToast?.(`បានកំណត់សំឡេងទាំងអស់ទៅជា៖ ${displayName}`);
}

/**
 * Synchronize unblurred input values from active DOM inputs into state.subtitles
 */
export function syncSubtitlesFromDOM() {
  if (typeof document === 'undefined' || !Array.isArray(state.subtitles) || state.subtitles.length === 0) return;
  state.subtitles.forEach(sub => {
    const startInput = document.querySelector(`.sub-time-input[data-id="${sub.id}"][data-field="start"]`);
    const endInput = document.querySelector(`.sub-time-input[data-id="${sub.id}"][data-field="end"]`);
    const origInput = document.querySelector(`.sub-original-text-input[data-id="${sub.id}"]`);
    const kmInput = document.querySelector(`.sub-text-input[data-id="${sub.id}"]`);
    const voiceSelect = document.querySelector(`.sub-voice-select[data-id="${sub.id}"]`);

    if (startInput && startInput.value.trim()) {
      sub.start = startInput.value.trim();
      sub.startSec = parseTimecodeSRT(sub.start);
    }
    if (endInput && endInput.value.trim()) {
      sub.end = endInput.value.trim();
      sub.endSec = parseTimecodeSRT(sub.end);
    }
    if (origInput) {
      sub.originalText = origInput.value.trim();
    }
    if (kmInput) {
      sub.khmerText = kmInput.value.trim();
    }
    if (voiceSelect && voiceSelect.value) {
      sub.voice = voiceSelect.value;
    }
  });
}

/**
 * Real JSON File Export
 * Generates an exact structured JSON containing:
 * - start & end timecodes (string & seconds)
 * - originalText (Chinese original text)
 * - englishText (English pivot translation)
 * - khmerText (Khmer dubbing dialogue)
 * - voice (Voice profile assigned)
 * - id (Subtitle block identifier)
 */
export function exportJSONFile(filename = 'subtitles_project.json') {
  syncSubtitlesFromDOM();

  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast?.('⚠️ គ្មានទិន្នន័យ Subtitle សម្រាប់ Export ទេ');
    return;
  }

  const exportData = state.subtitles.map(sub => ({
    id: sub.id,
    start: sub.start || formatTimecodeSRT(sub.startSec || 0),
    end: sub.end || formatTimecodeSRT(sub.endSec || 0),
    startSec: typeof sub.startSec === 'number' ? Math.round(sub.startSec * 1000) / 1000 : parseTimecodeSRT(sub.start),
    endSec: typeof sub.endSec === 'number' ? Math.round(sub.endSec * 1000) / 1000 : parseTimecodeSRT(sub.end),
    originalText: sub.originalText || '',
    englishText: sub.englishText || '',
    khmerText: sub.khmerText || '',
    voice: sub.voice || 'Piseth (Male)'
  }));

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window.showToast?.(`✅ ទាញយកឯកសារ ${filename} (JSON) ជោគជ័យ!`);
}

/**
 * Trigger File Selector for JSON / Subtitle Upload
 */
export function triggerJSONUpload() {
  const jsonInput = document.getElementById('json-file-input') || document.getElementById('srt-file-input');
  if (jsonInput) {
    jsonInput.value = '';
    jsonInput.click();
  }
}

/**
 * Real JSON File Import
 * Parses an uploaded .json file with full preservation of:
 * - Start / End timestamps
 * - Chinese text (originalText)
 * - English text (englishText)
 * - Khmer text (khmerText)
 * - Character voice assignments
 */
export function importJSONContent(content) {
  if (!content || typeof content !== 'string') {
    window.showToast?.('⚠️ មិនមានទិន្នន័យសម្រាប់ Import ទេ');
    return;
  }

  stopVoicePlayback();
  let data = null;
  const trimmed = content.trim();

  // Try parsing JSON
  try {
    data = JSON.parse(trimmed);
  } catch (jsonErr) {
    // If user selected an SRT file, gracefully fallback to SRT parser
    if (trimmed.includes('-->')) {
      return importSRTContent(trimmed);
    }
    console.error('JSON parsing error:', jsonErr);
    window.showToast?.('⚠️ ទម្រង់ File JSON មិនត្រឹមត្រូវ (JSON Parse Error)');
    return;
  }

  // Extract subtitle array from various possible structures
  let rawList = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.subtitles)) {
      rawList = data.subtitles;
    } else if (Array.isArray(data.data)) {
      rawList = data.data;
    } else if (Array.isArray(data.items)) {
      rawList = data.items;
    }
  }

  if (!rawList || rawList.length === 0) {
    window.showToast?.('⚠️ មិនមានទិន្នន័យ Subtitle ក្នុង File JSON នេះទេ');
    return;
  }

  // Map & validate fields with multi-language preservation
  const parsed = [];
  rawList.forEach((sub, idx) => {
    if (!sub || typeof sub !== 'object') return;

    let startSec = 0;
    let endSec = 0;

    if (typeof sub.startSec === 'number' && !isNaN(sub.startSec)) {
      startSec = sub.startSec;
    } else if (sub.start) {
      startSec = parseTimecodeSRT(sub.start);
    }

    if (typeof sub.endSec === 'number' && !isNaN(sub.endSec)) {
      endSec = sub.endSec;
    } else if (sub.end) {
      endSec = parseTimecodeSRT(sub.end);
    }

    const startStr = sub.start ? String(sub.start).trim() : formatTimecodeSRT(startSec);
    const endStr = sub.end ? String(sub.end).trim() : formatTimecodeSRT(endSec);

    const originalText = String(
      sub.originalText ?? sub.chinaText ?? sub.chineseText ?? sub.sourceText ?? ''
    ).trim();

    const englishText = String(
      sub.englishText ?? sub.enText ?? sub.english ?? ''
    ).trim();

    const khmerText = String(
      sub.khmerText ?? sub.kmText ?? sub.translatedText ?? sub.translation ?? sub.text ?? ''
    ).trim();

    let voice = String(sub.voice || '').trim();
    if (!voice || (!voice.includes('Male') && !voice.includes('Female'))) {
      voice = 'Piseth (Male)';
    }

    parsed.push({
      id: sub.id ? String(sub.id) : 'sub-' + (Date.now() + idx),
      selected: false,
      start: startStr,
      end: endStr,
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      originalText: originalText,
      englishText: englishText,
      khmerText: khmerText,
      voice: voice,
      status: sub.status || 'Pending'
    });
  });

  if (parsed.length > 0) {
    state.subtitles = parsed;
    renderSubtitleTable();
    state.emit('subtitlesChanged', state.subtitles);
    if (typeof window !== 'undefined' && window.triggerProjectAutoSave) {
      window.triggerProjectAutoSave();
    }
    window.showToast?.(`✅ បាននាំចូលទិន្នន័យ JSON ចំនួន ${parsed.length} ជួរជោគជ័យ!`);
  } else {
    window.showToast?.('⚠️ មិនអាចស្វែងរកទិន្នន័យ Subtitle ត្រឹមត្រូវពី File JSON ឡើយ');
  }
}

/**
 * Real SRT File Export
 * Generates an actual .srt text string and triggers browser file download
 */
export function exportSRTFile(filename) {
  syncSubtitlesFromDOM();

  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast?.('⚠️ គ្មានទិន្នន័យ Subtitle សម្រាប់ Export ទេ');
    return;
  }

  // Derive dynamic filename from loaded video if available
  if (!filename || filename === 'subtitles_khmer.srt') {
    if (state.videoName) {
      const baseName = state.videoName.replace(/\.[^/.]+$/, '');
      filename = `${baseName}.srt`;
    } else {
      filename = 'subtitles.srt';
    }
  }

  let srtContent = '';
  state.subtitles.forEach((sub, index) => {
    const startTime = (typeof sub.startSec === 'number' && !isNaN(sub.startSec))
      ? formatTimecodeSRT(sub.startSec)
      : (sub.start || '00:00:00,000');
    const endTime = (typeof sub.endSec === 'number' && !isNaN(sub.endSec))
      ? formatTimecodeSRT(sub.endSec)
      : (sub.end || '00:00:00,000');
    const text = (sub.khmerText && sub.khmerText.trim())
      ? sub.khmerText.trim()
      : (sub.originalText ? sub.originalText.trim() : '');

    srtContent += `${index + 1}\r\n`;
    srtContent += `${startTime} --> ${endTime}\r\n`;
    srtContent += `${text}\r\n\r\n`;
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

  window.showToast?.(`✅ ទាញយកឯកសារ ${filename} (SRT) ជោគជ័យ!`);
}

/**
 * Trigger File Selector for SRT Subtitle Upload
 */
export function triggerSRTUpload() {
  const srtInput = document.getElementById('srt-file-input') || document.getElementById('json-file-input');
  if (srtInput) {
    srtInput.value = '';
    srtInput.click();
  }
}

/**
 * Real SRT File Import
 * Parses an uploaded .srt file into state.subtitles
 */
export function importSRTContent(content) {
  if (!content || typeof content !== 'string') {
    window.showToast?.('⚠️ មិនមានទិន្នន័យសម្រាប់ Import ទេ');
    return;
  }
  stopVoicePlayback();

  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n+/);
  const parsed = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const arrowIdx = lines.findIndex(l => l.includes('-->'));
    if (arrowIdx !== -1) {
      const timeLine = lines[arrowIdx];
      const timeMatch = timeLine.match(/([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})\s*-->\s*([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})/);
      if (timeMatch) {
        const start = timeMatch[1].replace('.', ',');
        const end = timeMatch[2].replace('.', ',');
        const text = lines.slice(arrowIdx + 1).join(' ').trim();
        
        // Detect if text contains Khmer characters
        const isKhmer = /[\u1780-\u17FF]/.test(text);

        parsed.push({
          id: 'sub-' + (Date.now() + idx),
          selected: false,
          start: start,
          end: end,
          startSec: parseTimecodeSRT(start),
          endSec: parseTimecodeSRT(end),
          khmerText: isKhmer ? text : '',
          originalText: text,
          voice: 'Piseth (Male)',
          status: 'Pending'
        });
      }
    }
  });

  if (parsed.length > 0) {
    state.subtitles = parsed;
    renderSubtitleTable();
    state.emit('subtitlesChanged', state.subtitles);
    window.showToast?.(`✅ បាននាំចូល Subtitle ចំនួន ${parsed.length} ជោគជ័យ!`);
  } else {
    window.showToast?.('⚠️ ទម្រង់ File SRT មិនត្រឹមត្រូវ');
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

/**
 * Auto-resize textarea height according to text content
 */
export function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(34, textarea.scrollHeight) + 'px';
}

/**
 * Toggle Fullscreen Mode for the Subtitle Panel
 */
export function toggleSubtitleFullscreen() {
  const section = document.getElementById('subtitle-section');
  if (!section) return;

  const isFullscreen = section.classList.contains('subtitle-fullscreen-active');
  if (isFullscreen) {
    exitSubtitleFullscreen();
  } else {
    enterSubtitleFullscreen();
  }
}

export function enterSubtitleFullscreen() {
  const section = document.getElementById('subtitle-section');
  if (!section) return;

  section.classList.add('subtitle-fullscreen-active');
  document.body.classList.add('subtitle-is-fullscreen');

  const btnIcon = document.getElementById('fullscreen-icon');
  const btnText = document.getElementById('fullscreen-text');
  const btn = document.getElementById('btn-toggle-fullscreen');

  if (btnIcon) {
    btnIcon.setAttribute('data-lucide', 'minimize-2');
  }
  if (btnText) {
    btnText.textContent = 'Exit';
  }
  if (btn) {
    btn.title = 'ចាកចេញពី Fullscreen (Esc)';
    btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
    btn.classList.remove('bg-slate-800', 'text-indigo-300');
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // Adjust all auto-resizing textareas in fullscreen mode
  setTimeout(() => {
    document.querySelectorAll('.sub-text-input').forEach(ta => autoResizeTextarea(ta));
  }, 50);
}

export function exitSubtitleFullscreen() {
  const section = document.getElementById('subtitle-section');
  if (!section) return;

  section.classList.remove('subtitle-fullscreen-active');
  document.body.classList.remove('subtitle-is-fullscreen');

  const btnIcon = document.getElementById('fullscreen-icon');
  const btnText = document.getElementById('fullscreen-text');
  const btn = document.getElementById('btn-toggle-fullscreen');

  if (btnIcon) {
    btnIcon.setAttribute('data-lucide', 'maximize-2');
  }
  if (btnText) {
    btnText.textContent = 'Fullscreen';
  }
  if (btn) {
    btn.title = 'ពង្រីកពេញអេក្រង់ (Fullscreen / Esc)';
    btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
    btn.classList.add('bg-slate-800', 'text-indigo-300');
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // Adjust all auto-resizing textareas on exit
  setTimeout(() => {
    document.querySelectorAll('.sub-text-input').forEach(ta => autoResizeTextarea(ta));
  }, 50);
}

// Window resize listener to keep textareas fitted
if (typeof window !== 'undefined') {
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => {
      document.querySelectorAll('.sub-text-input').forEach(ta => autoResizeTextarea(ta));
    });
  }

  // Expose to window for global HTML access
  window.playVoice = playVoice;
  window.stopVoicePlayback = stopVoicePlayback;
  window.toggleSubtitleFullscreen = toggleSubtitleFullscreen;
  window.enterSubtitleFullscreen = enterSubtitleFullscreen;
  window.exitSubtitleFullscreen = exitSubtitleFullscreen;
  window.autoResizeTextarea = autoResizeTextarea;
  window.exportJSONFile = exportJSONFile;
  window.importJSONContent = importJSONContent;
  window.triggerJSONUpload = triggerJSONUpload;
  window.syncSubtitlesFromDOM = syncSubtitlesFromDOM;
  window.exportSRTFile = exportSRTFile;
  window.importSRTContent = importSRTContent;
  window.triggerSRTUpload = triggerSRTUpload;
}

