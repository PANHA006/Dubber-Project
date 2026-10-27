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


const PLAY_ICON_SVG = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const PAUSE_ICON_SVG = '<svg class="w-3.5 h-3.5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

export function createSubtitleRowElement(sub, idx) {
  const tr = document.createElement('tr');
  tr.className = `group hover:bg-slate-800/40 transition-colors ${sub.selected ? 'bg-indigo-950/20' : ''}`;
  tr.dataset.id = sub.id;

  const isModified = sub.status === 'Modified' || sub.needsRegenerate;
  const isReady = (sub.status === 'Ready' || sub.audioUrl) && !isModified;
  const isPlaying = currentPlayingSubId === sub.id;

  tr.innerHTML = `
    <td class="py-2.5 px-3 text-center">
      <input type="checkbox" ${sub.selected ? 'checked' : ''} data-id="${sub.id}" class="sub-row-check rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
    </td>
    <td class="py-2 px-1.5 font-mono text-slate-300 text-[11px] w-[68px] min-w-[68px]">
      <input type="text" value="${sub.start}" data-field="start" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1 py-1 w-full font-mono outline-hidden text-[11px] tabular-nums" />
    </td>
    <td class="py-2 px-1.5 font-mono text-slate-300 text-[11px] w-[68px] min-w-[68px]">
      <input type="text" value="${sub.end}" data-field="end" data-id="${sub.id}" class="sub-time-input bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 focus:border-indigo-500 border border-transparent rounded px-1 py-1 w-full font-mono outline-hidden text-[11px] tabular-nums" />
    </td>
    <td class="py-2 px-3 align-top">
      <input type="text" value="${escapeHtml(sub.originalText || '')}" data-id="${sub.id}" class="sub-original-text-input w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 focus:border-indigo-500/60 border border-transparent rounded px-2 py-1 outline-hidden text-slate-200 transition text-xs placeholder:text-slate-600" placeholder="Original speech..." />
      ${
        hasEnglishPivot(sub)
          ? `<div class="mt-1 flex items-start gap-1.5 px-1" title="English Pivot (Step 1): ${escapeHtml(sub.englishText)}">
              <span class="shrink-0 mt-[1px] text-[9px] font-bold font-mono px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 leading-none">EN</span>
              <textarea rows="1" data-id="${sub.id}" class="sub-english-text-input flex-1 min-w-0 bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 focus:border-cyan-500/60 border border-transparent rounded px-1.5 py-0.5 outline-hidden text-cyan-300/90 transition text-[11px] leading-snug resize-none overflow-hidden block placeholder:text-slate-600" placeholder="English pivot...">${escapeHtml(sub.englishText)}</textarea>
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
                isPlaying
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-emerald-400'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300'
              } font-medium text-xs transition active:scale-95 cursor-pointer">
              ${isPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
              <span class="text-[11px] font-mono font-bold">${isPlaying ? 'Playing' : 'Play'}</span>
            </button>
            ${
              sub.speedApplied && sub.speedApplied > 1.04
                ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold" title="Auto-Speed: បានបង្កើនល្បឿន ${sub.speedApplied}x ដើម្បីតម្រូវតាមពេលវេលា Start/End">⚡${sub.speedApplied}x</span>`
                : `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/50" title="ល្បឿនធម្មជាតិ: 1.0x">1.0x</span>`
            }
          </div>
          `
          : isModified
          ? `
          <div class="inline-flex items-center gap-1.5">
            <button onclick="window.playVoice('${sub.id}')"
              title="អត្ថបទត្រូវបានកែប្រែ (សូមចុច Re-Generate Voice ខាងក្រោម)"
              class="sub-voice-play-btn inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg ${
                isPlaying
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 hover:text-amber-300'
              } font-medium text-xs transition active:scale-95 cursor-pointer">
              ${isPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
              <span class="text-[11px] font-mono font-bold">${isPlaying ? 'Playing' : 'Play'}</span>
            </button>
            ${
              sub.speedApplied && sub.speedApplied > 1.04
                ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold" title="Auto-Speed: ${sub.speedApplied}x">⚡${sub.speedApplied}x</span>`
                : `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/50" title="ល្បឿនធម្មជាតិ: 1.0x">1.0x</span>`
            }
          </div>
          `
          : `
          <div title="មិនទាន់មានសំឡេង (សូមចុច Generate Voice ខាងក្រោម)"
            class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-500 opacity-40 cursor-not-allowed select-none">
            ${PLAY_ICON_SVG}
            <span class="text-[11px] font-medium text-slate-500">Pending</span>
          </div>
          `
      }
    </td>
  `;
  return tr;
}

export function renderSubtitleTable() {
  const tbody = document.getElementById('subtitle-table-body');
  if (!tbody) return;

  // Cancel any in-flight chunked render animation
  if (renderSubtitleTable._animId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(renderSubtitleTable._animId);
    renderSubtitleTable._animId = null;
  }

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
    return;
  }

  ensureDelegatedTableListeners(tbody);

  const subs = state.subtitles;
  const total = subs.length;
  // Render first 50 rows immediately (< 15ms)
  const INITIAL_BATCH = Math.min(total, 50);
  const CHUNK_SIZE = 80;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < INITIAL_BATCH; i++) {
    frag.appendChild(createSubtitleRowElement(subs[i], i));
  }
  tbody.appendChild(frag);

  // Progressive background streaming of remaining rows to guarantee 60 FPS
  if (total > INITIAL_BATCH && typeof requestAnimationFrame === 'function') {
    let currentIdx = INITIAL_BATCH;
    function renderNextChunk() {
      const nextFrag = document.createDocumentFragment();
      const end = Math.min(total, currentIdx + CHUNK_SIZE);
      for (let i = currentIdx; i < end; i++) {
        nextFrag.appendChild(createSubtitleRowElement(subs[i], i));
      }
      tbody.appendChild(nextFrag);
      currentIdx = end;
      if (currentIdx < total) {
        renderSubtitleTable._animId = requestAnimationFrame(renderNextChunk);
      } else {
        renderSubtitleTable._animId = null;
      }
    }
    renderSubtitleTable._animId = requestAnimationFrame(renderNextChunk);
  }
}

export function ensureDelegatedTableListeners(tbody) {
  if (!tbody || tbody._delegated) return;
  tbody._delegated = true;

  // 1. Delegated Change (Checkboxes, Timecode Inputs, Voice Dropdowns)
  tbody.addEventListener('change', (e) => {
    const target = e.target;
    const id = target.getAttribute('data-id');
    if (!id) return;
    const sub = state.subtitles.find(s => s.id === id);
    if (!sub) return;

    if (target.matches('.sub-row-check')) {
      sub.selected = target.checked;
      const row = target.closest('tr');
      if (row) row.classList.toggle('bg-indigo-950/20', sub.selected);
      state.emit('subtitlesChanged', state.subtitles);
    } else if (target.matches('.sub-time-input')) {
      const field = target.getAttribute('data-field');
      const val = target.value.trim();
      const seconds = parseTimecodeSRT(val);
      sub[field] = formatTimecodeSRT(seconds);
      target.value = sub[field];

      if (field === 'start') sub.startSec = seconds;
      if (field === 'end') sub.endSec = seconds;

      state.emit('subtitlesChanged', state.subtitles);
    } else if (target.matches('.sub-voice-select')) {
      if (sub.voice !== target.value) {
        sub.voice = target.value;
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
  });

  // 2. Delegated Input (Original text, English pivot, Khmer translation)
  tbody.addEventListener('input', (e) => {
    const target = e.target;
    const id = target.getAttribute('data-id');
    if (!id) return;
    const sub = state.subtitles.find(s => s.id === id);
    if (!sub) return;

    if (target.matches('.sub-original-text-input')) {
      sub.originalText = target.value;
      state.emit('subtitlesChanged', state.subtitles);
    } else if (target.matches('.sub-english-text-input')) {
      autoResizeTextarea(target);
      sub.englishText = target.value;
      state.emit('subtitlesChanged', state.subtitles);
    } else if (target.matches('.sub-text-input')) {
      autoResizeTextarea(target);
      target.title = target.value;
      sub.khmerText = target.value;
      sub.selected = true;

      if (sub.status === 'Ready' || sub.audioUrl) {
        sub.status = 'Modified';
        sub.needsRegenerate = true;
        if (!sub.oldAudioUrl && sub.audioUrl) {
          sub.oldAudioUrl = sub.audioUrl;
        }
      }

      const row = target.closest('tr');
      if (row) {
        row.classList.add('bg-indigo-950/20');
        const cb = row.querySelector('.sub-row-check');
        if (cb) cb.checked = true;

        if (sub.status === 'Modified') {
          const soundTd = row.querySelector('td:last-child');
          if (soundTd && !soundTd.querySelector('.text-amber-400')) {
            soundTd.innerHTML = `
              <button onclick="window.playVoice('${sub.id}')"
                title="អត្ថបទត្រូវបានកែប្រែ (សូមចុច Re-Generate Voice ខាងក្រោម)"
                class="sub-voice-play-btn inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 hover:text-amber-300 font-medium text-xs transition active:scale-95 cursor-pointer">
                ${PLAY_ICON_SVG}
                <span class="text-[11px] font-mono font-bold">Play</span>
              </button>
            `;
          }
        }
      }

      state.emit('activeSubtitleUpdate', state.currentTime);
      state.emit('subtitlesChanged', state.subtitles);
    }
  });

  // 3. Lazy focus auto-resize
  tbody.addEventListener('focusin', (e) => {
    if (e.target.matches('.sub-text-input, .sub-english-text-input')) {
      autoResizeTextarea(e.target);
    }
  });
}

function attachTableEventListeners() {
  const tbody = document.getElementById('subtitle-table-body');
  if (tbody) ensureDelegatedTableListeners(tbody);
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
    const enInput = document.querySelector(`.sub-english-text-input[data-id="${sub.id}"]`);
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
    if (enInput) {
      sub.englishText = enInput.value.trim();
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
 * Pick the text that should be written into an exported .srt block.
 *
 * EXPORT CONTRACT — the ORIGINAL speech is exported, not the translation.
 * SRT is the round-trip / hand-off format: the user exports the source text,
 * translates it outside the app, then imports the result back as Khmer.
 * `khmerText` is therefore only a fallback, so a row that has nothing but a
 * translation still produces a usable block instead of an empty line.
 *
 * @param {Object} sub
 * @returns {string}
 */
export function pickSrtExportText(sub) {
  const original = (sub?.originalText || '').trim();
  if (original) return original;
  return (sub?.khmerText || '').trim();
}

/**
 * Build a SubRip (.srt) document from the subtitle list.
 *
 * Kept as a pure function (no DOM, no state) so the export contract can be
 * unit-tested directly instead of through a duplicated copy of this logic.
 *
 * @param {Array<Object>} subtitles
 * @returns {string}
 */
export function buildSRTString(subtitles) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) return '';

  let srtContent = '';
  subtitles.forEach((sub, index) => {
    const startTime = (typeof sub.startSec === 'number' && !isNaN(sub.startSec))
      ? formatTimecodeSRT(sub.startSec)
      : (sub.start || '00:00:00,000');
    const endTime = (typeof sub.endSec === 'number' && !isNaN(sub.endSec))
      ? formatTimecodeSRT(sub.endSec)
      : (sub.end || '00:00:00,000');

    srtContent += `${index + 1}\r\n`;
    srtContent += `${startTime} --> ${endTime}\r\n`;
    srtContent += `${pickSrtExportText(sub)}\r\n\r\n`;
  });
  return srtContent;
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

  // The hand-off file always uses a fixed name so the external translation
  // round-trip has a predictable filename to work with.
  const downloadName = filename || 'Subtitle.srt';

  const srtContent = buildSRTString(state.subtitles);

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window.showToast?.(`✅ ទាញយកឯកសារ ${downloadName} ជោគជ័យ! (អត្ថបទដើម Original សម្រាប់បកប្រែខាងក្រៅ)`);
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
 * Parse a SubRip (.srt) document into the project's subtitle row shape.
 *
 * IMPORT CONTRACT — the text found in the file becomes the KHMER line.
 * SRT is the round-trip / hand-off format: the user exports the original
 * speech, translates it outside the app, then imports the result here as the
 * Khmer dubbing text. `originalText` is deliberately left empty; the smart
 * merge below restores it from the project when the file matches.
 *
 * Kept as a pure function (no DOM, no state) so the import contract can be
 * unit-tested directly instead of through a duplicated copy of this logic.
 *
 * @param {string} content
 * @returns {Array<Object>}
 */
export function parseSRTContent(content) {
  if (!content || typeof content !== 'string') return [];

  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n+/);
  const parsed = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const arrowIdx = lines.findIndex(l => l.includes('-->'));
    if (arrowIdx === -1) return;

    const timeMatch = lines[arrowIdx].match(/([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})\s*-->\s*([0-9]{1,2}:[0-9]{2}:[0-9]{2}[,.:][0-9]{1,3})/);
    if (!timeMatch) return;

    const start = timeMatch[1].replace('.', ',');
    const end = timeMatch[2].replace('.', ',');
    const text = lines.slice(arrowIdx + 1).join(' ').trim();

    parsed.push({
      id: 'sub-' + (Date.now() + idx),
      selected: false,
      start: start,
      end: end,
      startSec: parseTimecodeSRT(start),
      endSec: parseTimecodeSRT(end),
      khmerText: text,
      originalText: '',
      englishText: '',
      voice: 'Piseth (Male)',
      status: 'Pending'
    });
  });

  return parsed;
}

/**
 * Default join tolerance, in seconds.
 *
 * The project stores start times rounded to the millisecond and SubRip keeps
 * three decimals, so an exact match normally succeeds. The tolerance only has
 * to absorb jitter from a re-transcription, so it stays small on purpose —
 * widening it would start pairing genuinely different lines.
 */
export const JOIN_TOLERANCE_SEC = 0.20;

/**
 * Read a row's start time in seconds, whichever shape it arrives in.
 * @param {Object} row
 * @returns {number} Seconds, or NaN when unreadable.
 */
function rowStartSec(row) {
  if (typeof row?.startSec === 'number' && !isNaN(row.startSec)) return row.startSec;
  if (row?.start) return parseTimecodeSRT(row.start);
  return NaN;
}

/**
 * Join an imported SRT onto the current project by TIMECODE.
 *
 * Why timecode and not row position: `applySmartEndPadding()` extends every
 * row's END by up to +0.70s (bounded by the next row's start), so `endSec` is
 * NOT stable across a round-trip. `startSec` is never touched, which makes it
 * the only reliable identity for a line. Matching by position also breaks as
 * soon as a row is added or deleted in the table.
 *
 * Strategy, in order:
 *   1. Greedy nearest-`startSec` match within `tolerance` (smallest delta wins,
 *      each row and each block used at most once).
 *   2. Interpolation between two confirmed timecode anchors — rescues a block
 *      whose own timestamp was edited. Only accepted when the anchors agree on
 *      the spacing, so an inserted or removed line is never absorbed.
 *   3. Positional fallback — only when neither of the above matched ANYTHING
 *      and the row counts are equal. The file is then from a different timing
 *      base and the block number is the only remaining signal.
 *   4. Anything still unmatched is appended as a NEW row at the end.
 *
 * Rows already in the table are never deleted, and a matched row keeps its
 * `originalText`, `englishText`, `voice`, `id` and timing — only `khmerText`
 * is replaced. The file's timings are used purely as the join key, never
 * copied over the project's (already padded and video-aligned) timing.
 *
 * @param {Array<Object>} imported Rows produced by parseSRTContent().
 * @param {Array<Object>} existing Current state.subtitles.
 * @param {{tolerance?: number}} [options]
 * @returns {{rows: Array<Object>, matched: number, byTimecode: number, byInterpolation: number, byPosition: number, appended: number, unmatchedExisting: number}}
 */
export function joinImportedSRT(imported, existing, options = {}) {
  const tolerance = typeof options.tolerance === 'number' ? options.tolerance : JOIN_TOLERANCE_SEC;
  const incoming = Array.isArray(imported) ? imported : [];
  const rows = Array.isArray(existing) ? existing.map(r => ({ ...r })) : [];

  // An empty file must never destroy the project — hand the rows straight back.
  if (incoming.length === 0) {
    return {
      rows,
      matched: 0,
      byTimecode: 0,
      byInterpolation: 0,
      byPosition: 0,
      appended: 0,
      unmatchedExisting: rows.length
    };
  }

  // Nothing to join against — every incoming block becomes a new row.
  if (rows.length === 0) {
    return {
      rows: incoming.map(r => ({ ...r })),
      matched: 0,
      byTimecode: 0,
      byInterpolation: 0,
      byPosition: 0,
      appended: incoming.length,
      unmatchedExisting: 0
    };
  }

  const blockTaken = new Array(incoming.length).fill(false);
  const rowTaken = new Array(rows.length).fill(false);
  const blockToRow = new Array(incoming.length).fill(-1);

  // --- Pass 1: timecode join (greedy, globally smallest delta first) --------
  const pairs = [];
  incoming.forEach((block, bi) => {
    const blockStart = rowStartSec(block);
    if (isNaN(blockStart)) return;
    rows.forEach((row, ri) => {
      const rowStart = rowStartSec(row);
      if (isNaN(rowStart)) return;
      const delta = Math.abs(rowStart - blockStart);
      if (delta <= tolerance) pairs.push({ bi, ri, delta });
    });
  });
  pairs.sort((a, b) => a.delta - b.delta);

  let byTimecode = 0;
  for (const pair of pairs) {
    if (blockTaken[pair.bi] || rowTaken[pair.ri]) continue;
    blockTaken[pair.bi] = true;
    rowTaken[pair.ri] = true;
    blockToRow[pair.bi] = pair.ri;
    rows[pair.ri].khmerText = incoming[pair.bi].khmerText;
    byTimecode++;
  }

  // --- Pass 2: interpolation between confirmed anchors ----------------------
  // A block whose timecode is broken but which sits between two timecode
  // matches can be placed by counting: if the anchors agree on the spacing
  // (blockSpan === rowSpan) the mapping between them is 1:1 and the block's
  // row follows arithmetically.
  //
  // This is what separates "this one timestamp was edited" from "this is a new
  // line". A new line makes the two anchors disagree on the spacing, so the
  // guess is rejected and the block is appended instead of overwriting a row.
  //
  // Only timecode matches act as anchors — an interpolated row is not promoted
  // to an anchor, so a bad guess can never cascade.
  let byInterpolation = 0;
  if (byTimecode > 0) {
    const anchors = [];
    incoming.forEach((_, bi) => {
      if (blockToRow[bi] !== -1) anchors.push({ bi, ri: blockToRow[bi] });
    });

    incoming.forEach((block, bi) => {
      if (blockTaken[bi]) return;

      let prev = null;
      let next = null;
      for (const anchor of anchors) {
        if (anchor.bi < bi) prev = anchor;
        else if (anchor.bi > bi && next === null) next = anchor;
      }

      let expected = -1;
      if (prev && next) {
        const blockSpan = next.bi - prev.bi;
        const rowSpan = next.ri - prev.ri;
        // Spacing must agree, otherwise a line was inserted or removed here.
        if (blockSpan === rowSpan) expected = prev.ri + (bi - prev.bi);
      } else if (prev || next) {
        // Only one anchor to lean on, so a 1:1 file-to-table correspondence has
        // to be assumed — which is only meaningful when both sides are the same
        // size. Without that, a stray trailing block could claim a real row.
        if (incoming.length === rows.length) {
          expected = prev ? prev.ri + (bi - prev.bi) : next.ri - (next.bi - bi);
        }
      }

      if (expected < 0 || expected >= rows.length) return;
      if (rowTaken[expected]) return;

      blockTaken[bi] = true;
      rowTaken[expected] = true;
      blockToRow[bi] = expected;
      rows[expected].khmerText = block.khmerText;
      byInterpolation++;
    });
  }

  // --- Pass 3: positional fallback -----------------------------------------
  // Only when neither of the above matched ANYTHING. The file is then from a
  // different timing base and the only remaining signal is the block number,
  // which requires an equal row count to be meaningful.
  let byPosition = 0;
  if (byTimecode === 0 && byInterpolation === 0 && incoming.length === rows.length) {
    incoming.forEach((block, bi) => {
      if (blockTaken[bi] || rowTaken[bi]) return;
      blockTaken[bi] = true;
      rowTaken[bi] = true;
      rows[bi].khmerText = block.khmerText;
      byPosition++;
    });
  }

  // --- Pass 4: append whatever is still unmatched ---------------------------
  const appended = incoming.filter((_, bi) => !blockTaken[bi]).map(block => ({ ...block }));

  return {
    rows: rows.concat(appended),
    matched: byTimecode + byInterpolation + byPosition,
    byTimecode,
    byInterpolation,
    byPosition,
    appended: appended.length,
    unmatchedExisting: rowTaken.filter(taken => !taken).length
  };
}

/**
 * Real SRT File Import
 * Parses an uploaded .srt file and joins it onto the current table by timecode,
 * treating the file's text as the Khmer translation of the project's original
 * speech.
 */
export function importSRTContent(content) {
  if (!content || typeof content !== 'string') {
    window.showToast?.('⚠️ មិនមានទិន្នន័យសម្រាប់ Import ទេ');
    return;
  }
  stopVoicePlayback();

  const parsed = parseSRTContent(content);
  if (parsed.length === 0) {
    window.showToast?.('⚠️ ទម្រង់ File SRT មិនត្រឹមត្រូវ');
    return;
  }

  const { rows, matched, byTimecode, byInterpolation, byPosition, appended } =
    joinImportedSRT(parsed, state.subtitles);

  state.subtitles = rows;
  renderSubtitleTable();
  state.emit('subtitlesChanged', state.subtitles);

  if (appended === 0) {
    const notes = [];
    if (byInterpolation) notes.push(`${byInterpolation} តាម ID`);
    if (byPosition) notes.push(`${byPosition} តាមលំដាប់`);
    const suffix = notes.length ? ` (ក្នុងនោះ ${notes.join(' · ')})` : '';
    window.showToast?.(`✅ ផ្គូផ្គងបាន ${matched}/${parsed.length} ជួរ${suffix}`);
  } else {
    window.showToast?.(
      `✅ ផ្គូផ្គង ${matched} ជួរ (Timecode ${byTimecode}${byInterpolation ? ` · ID ${byInterpolation}` : ''}) · បន្ថែមជួរថ្មី ${appended} ជួរ`
    );
  }
}

/**
 * Decide whether a subtitle row should display its English pivot line.
 *
 * The translator mirrors `originalText` into `englishText` when it takes the
 * DIRECT Chinese -> Khmer path (there is no real English pivot). Showing that
 * mirror would duplicate the Original column verbatim, so we suppress it.
 *
 * A row shows the EN line only when `englishText` is non-empty AND differs from
 * the original text.
 *
 * @param {Object} sub
 * @returns {boolean}
 */
export function hasEnglishPivot(sub) {
  const en = (sub?.englishText || '').trim();
  if (!en) return false;
  const original = (sub?.originalText || sub?.text || '').trim();
  return en.toLowerCase() !== original.toLowerCase();
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

const MINIMIZE_ICON_SVG = '<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7"/></svg>';
const MAXIMIZE_ICON_SVG = '<svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7M3 9V3m0 0h6m-6 0l7 7m14 5v6m0 0h-6m6 0l-7-7"/></svg>';

function setFullscreenButtonIcon(isEnter) {
  const btnIcon = document.getElementById('fullscreen-icon');
  const svg = isEnter ? MINIMIZE_ICON_SVG : MAXIMIZE_ICON_SVG;
  if (btnIcon) {
    btnIcon.outerHTML = `<span id="fullscreen-icon" class="inline-flex items-center">${svg}</span>`;
  }
}

export function enterSubtitleFullscreen() {
  const section = document.getElementById('subtitle-section');
  if (!section) return;

  section.classList.add('subtitle-fullscreen-active');
  document.body.classList.add('subtitle-is-fullscreen');

  setFullscreenButtonIcon(true);

  const btnText = document.getElementById('fullscreen-text');
  const btn = document.getElementById('btn-toggle-fullscreen');

  if (btnText) {
    btnText.textContent = 'Exit';
  }
  if (btn) {
    btn.title = 'ចាកចេញពី Fullscreen (Esc)';
    btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
    btn.classList.remove('bg-slate-800', 'text-indigo-300');
  }
}

export function exitSubtitleFullscreen() {
  const section = document.getElementById('subtitle-section');
  if (!section) return;

  section.classList.remove('subtitle-fullscreen-active');
  document.body.classList.remove('subtitle-is-fullscreen');

  setFullscreenButtonIcon(false);

  const btnText = document.getElementById('fullscreen-text');
  const btn = document.getElementById('btn-toggle-fullscreen');

  if (btnText) {
    btnText.textContent = 'Fullscreen';
  }
  if (btn) {
    btn.title = 'ពង្រីកពេញអេក្រង់ (Fullscreen / Esc)';
    btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
    btn.classList.add('bg-slate-800', 'text-indigo-300');
  }
}

// Global window registrations
if (typeof window !== 'undefined') {
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

