/**
 * Main Application Orchestrator for DAI Dubber Pro - Khmer Edition
 */
import { state } from './state.js';
import {
  renderSubtitleTable,
  addNewSubtitleRow,
  deleteSelectedSubtitles,
  selectAllSubtitles,
  setAllVoices,
  exportSRTFile,
  importSRTContent
} from './subtitles.js';
import {
  initTimeline,
  setTimelineZoom
} from './timeline.js';
import {
  initVideoPlayer,
  seekTo,
  togglePlay,
  stopPlayback,
  flipVideo,
  rotateVideo,
  toggleVideoAspect,
  toggleSubOverlay,
  cycleSubColor,
  toggleMuteAudio,
  toggleIsolateBGM
} from './video-player.js';

import { extractAudioChunksFromVideo, extractAudioFromVideo } from './audio-extractor.js';
import { parseTimecodeSRT, formatTimecodeSRT } from './subtitles.js';
import { logToTerminal } from './logger.js';

// Expose globally for HTML event attributes
window.state = state;
window.seekTo = seekTo;
window.togglePlay = togglePlay;
window.stopPlayback = stopPlayback;
window.flipVideo = flipVideo;
window.rotateVideo = rotateVideo;
window.toggleVideoAspect = toggleVideoAspect;
window.toggleSubOverlay = toggleSubOverlay;
window.cycleSubColor = cycleSubColor;
window.toggleMuteAudio = toggleMuteAudio;
window.toggleIsolateBGM = toggleIsolateBGM;
window.addNewSubtitleRow = addNewSubtitleRow;
window.deleteSelectedSubtitles = deleteSelectedSubtitles;
window.selectAllSubtitles = selectAllSubtitles;
window.setAllVoices = setAllVoices;
window.exportSRTFile = exportSRTFile;
window.setTimelineZoom = setTimelineZoom;

/**
 * AI Audio Transcription Workflow:
 * Extract audio from video on browser -> POST /api/transcribe -> Gemini AI -> Populate Subtitles Table
 */
window.startTranscription = async function() {
  if (state.isTranscribing) {
    window.showToast('កំពុងដំណើរការ Transcription រួចហើយ សូមរង់ចាំ...');
    return;
  }

  if (!state.currentVideoFile) {
    window.showToast('⚠️ សូមបញ្ចូល ឬជ្រើសរើសវីដេអូជាមុនសិន!');
    document.getElementById('video-file-input')?.click();
    return;
  }

  const btn = document.getElementById('btn-transcribe');
  const btnText = document.getElementById('transcribe-btn-text');
  const banner = document.getElementById('transcribe-progress-banner');
  const statusText = document.getElementById('transcribe-status-text');

  function updateProgress(msg) {
    if (statusText) statusText.textContent = msg;
    window.showToast?.(msg);
  }

  try {
    state.isTranscribing = true;
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Transcribing...';
    if (banner) banner.classList.remove('hidden');

    // 1. Client-side Audio Extraction & Smart Silence Auto-Chunking (09:30 - 10:30)
    logToTerminal('CLIENT:STATE', 'User clicked [Transcript] button', {
      video: state.currentVideoFile?.name,
      size: `${(state.currentVideoFile?.size / (1024 * 1024)).toFixed(2)} MB`
    });
    updateProgress('🎙️ កំពុងទាញយក និងវិភាគសំឡេង (Web Audio API)...');
    const chunks = await extractAudioChunksFromVideo(state.currentVideoFile, (progressMsg) => {
      updateProgress(progressMsg);
    });

    const totalChunks = chunks.length;
    let totalSegmentsAdded = 0;

    // Reset subtitle table at start of fresh transcription
    state.subtitles = [];
    renderSubtitleTable();

    // 2. Process each chunk through Gemini and offset timestamps
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkLabel = totalChunks > 1 
        ? `កង់ទី ${i + 1}/${totalChunks} (${formatTimecodeSRT(chunk.startTime).slice(3, 8)} - ${formatTimecodeSRT(chunk.endTime).slice(3, 8)})`
        : `សំឡេងទាំងមូល`;

      logToTerminal('CLIENT:UPLOAD', `Uploading ${chunkLabel} to backend /api/transcribe...`);
      updateProgress(`🚀 កំពុងបញ្ជូន ${chunkLabel} ទៅកាន់ Gemini AI (Flash)...`);

      const formData = new FormData();
      formData.append('audio', chunk.blob, `chunk_${i + 1}.wav`);
      if (state.geminiApiKey) {
        formData.append('apiKey', state.geminiApiKey);
      }

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        logToTerminal('CLIENT:ERROR', `Transcription failed for ${chunkLabel}: ${result.message}`);
        throw new Error(result.message || `ការចម្លង ${chunkLabel} ជាមួយ Gemini មិនជោគជ័យ`);
      }

      const segments = result.data;
      if (Array.isArray(segments) && segments.length > 0) {
        logToTerminal('TIMELINE:SYNC', `Offsetting timestamps (+${formatTimecodeSRT(chunk.startTime)}) for ${segments.length} subtitles`);
        const offsetSubtitles = segments.map((item, segIndex) => {
          const rawStart = item.start || '00:00:00,000';
          const rawEnd = item.end || '00:00:05,000';
          const startSec = parseTimecodeSRT(rawStart) + chunk.startTime;
          const endSec = parseTimecodeSRT(rawEnd) + chunk.startTime;
          const startStr = formatTimecodeSRT(startSec);
          const endStr = formatTimecodeSRT(endSec);
          const speaker = item.speaker || 'Piseth (Male)';

          return {
            id: `sub-ai-${Date.now()}-${i}-${segIndex}`,
            selected: false,
            start: startStr,
            end: endStr,
            startSec: startSec,
            endSec: endSec,
            khmerText: item.text || '',
            voice: speaker.includes('Female') ? 'Sreymom (Female)' : 'Piseth (Male)',
            status: 'Ready'
          };
        });

        // Real-time append and live render to Subtitle Table
        state.subtitles.push(...offsetSubtitles);
        totalSegmentsAdded += offsetSubtitles.length;
        renderSubtitleTable();

        logToTerminal('CLIENT:TABLE', `Rendered ${offsetSubtitles.length} new subtitles into table (Total: ${state.subtitles.length})`);

        if (totalChunks > 1) {
          window.showToast?.(`✨ បានបញ្ចប់ ${chunkLabel} (+${offsetSubtitles.length} ជួរ)`);
        }

        // Pacing delay between consecutive chunks to allow Google quota bucket to drain
        if (i < chunks.length - 1) {
          logToTerminal('CLIENT:STATE', `Chunk ${i + 1}/${totalChunks} complete. Waiting 3s before next chunk...`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    if (totalSegmentsAdded === 0) {
      logToTerminal('CLIENT:STATE', 'Transcription returned 0 spoken subtitles');
      window.showToast('⚠️ មិនមានសំឡេងនិយាយត្រូវបានរកឃើញក្នុងវីដេអូនេះទេ');
    } else {
      logToTerminal('CLIENT:DONE', `Transcription pipeline complete. Total subtitles: ${totalSegmentsAdded}`);
      window.showToast(`🎉 បានចម្លង Subtitles សរុបចំនួន ${totalSegmentsAdded} ជួរជោគជ័យ!`);
    }

  } catch (err) {
    console.error('Transcription error:', err);
    window.showToast(`❌ បរាជ័យ៖ ${err.message}`);
  } finally {
    state.isTranscribing = false;
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Transcript';
    if (banner) banner.classList.add('hidden');
  }
};

/**
 * Toast Notification system
 */
let toastTimer = null;
window.showToast = function(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = msg;
  toast.classList.remove('opacity-0', 'translate-y-16');
  toast.classList.add('opacity-100', 'translate-y-0');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-16');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2600);
};

/**
 * Video & SRT File trigger helpers
 */
window.triggerVideoUpload = function() {
  document.getElementById('video-file-input')?.click();
};

window.triggerSRTUpload = function() {
  document.getElementById('srt-file-input')?.click();
};

window.loadDemoBGM = function() {
  window.showToast('បានផ្ទុកភ្លេង Khmer Traditional & Ambient BGM Track');
};

window.toggleAutoFit = function() {
  state.autoFit = !state.autoFit;
  const btn = document.getElementById('btn-autofit');
  const txt = document.getElementById('autofit-text');
  if (state.autoFit) {
    btn?.classList.add('bg-amber-950/40', 'border-amber-500/50', 'text-amber-300');
    if (txt) txt.textContent = 'Auto-Fit: ON';
    window.showToast('Auto-Fit Timestamps: បើកដំណើរការ');
  } else {
    btn?.classList.remove('bg-amber-950/40', 'border-amber-500/50', 'text-amber-300');
    if (txt) txt.textContent = 'Auto-Fit: OFF';
    window.showToast('Auto-Fit Timestamps: បិទ');
  }
};

window.syncTrackEnd = function() {
  window.showToast('បានតម្រឹមចំណុចបញ្ចប់នៃសំឡេង A1 ទៅនឹង Subtitles');
};

window.mockTranscribe = function() {
  window.showToast('🎙️ AI Speech Recognition កំពុងវិភាគសំឡេងវីដេអូ...');
  setTimeout(() => {
    window.showToast('✅ បានបង្កើត Subtitle ភាសាខ្មែរជោគជ័យ!');
  }, 1600);
};

window.generateAllAudio = function() {
  window.showToast('🚀 កំពុងដំណើរការ Microsoft Edge TTS (Piseth / Sreymom)...');
  const pendings = state.subtitles.filter(s => s.status === 'Pending');
  if (pendings.length === 0) {
    window.showToast('គ្រប់ផ្នែកទាំងអស់បានត្រៀមរួចរាល់ (Ready) រួចហើយ!');
    return;
  }

  let idx = 0;
  const interval = setInterval(() => {
    if (idx < pendings.length) {
      pendings[idx].status = 'Ready';
      renderSubtitleTable();
      idx++;
    } else {
      clearInterval(interval);
      window.showToast('🎉 បានបង្កើតសំឡេង AI គ្រប់ផ្នែកជោគជ័យ!');
    }
  }, 600);
};

// Modal helpers
window.openSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  const apiKeyInput = document.getElementById('input-gemini-api-key');
  if (apiKeyInput) {
    apiKeyInput.value = state.geminiApiKey || '';
  }
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
};

window.saveSettings = function() {
  const apiKeyInput = document.getElementById('input-gemini-api-key');
  if (apiKeyInput) {
    state.geminiApiKey = apiKeyInput.value.trim();
    localStorage.setItem('gemini_api_key', state.geminiApiKey);
  }
  window.closeSettingsModal();
  window.showToast('បានរក្សាទុកការកំណត់ Workspace');
};

// Language switcher
window.setLanguage = function(lang) {
  state.activeLanguage = lang;
  const enBtn = document.getElementById('lang-en');
  const kmBtn = document.getElementById('lang-km');

  if (lang === 'km') {
    kmBtn?.classList.add('bg-indigo-600', 'text-white');
    kmBtn?.classList.remove('text-slate-400');
    enBtn?.classList.remove('bg-indigo-600', 'text-white');
    enBtn?.classList.add('text-slate-400');
    window.showToast('បានប្តូរទៅជាភាសាខ្មែរ');
  } else {
    enBtn?.classList.add('bg-indigo-600', 'text-white');
    enBtn?.classList.remove('text-slate-400');
    kmBtn?.classList.remove('bg-indigo-600', 'text-white');
    kmBtn?.classList.add('text-slate-400');
    window.showToast('Switched to English UI');
  }
};

/**
 * Backend API Health Check
 */
async function checkBackendConnection() {
  const badge = document.getElementById('server-badge');
  if (!badge) return;

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (res.ok && data.success) {
      badge.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>Online</span>
      `;
      badge.className = "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400";
    }
  } catch (e) {
    badge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
      <span>Local Offline</span>
    `;
    badge.className = "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-500/30 text-amber-400";
  }
}

/**
 * Keyboard Shortcuts Setup
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Avoid triggering shortcuts if typing in input / textarea / select
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    if (e.code === 'Space' && !isTyping) {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'Delete' && !isTyping) {
      e.preventDefault();
      deleteSelectedSubtitles();
    } else if (e.code === 'ArrowLeft' && !isTyping) {
      e.preventDefault();
      seekTo(state.currentTime - 1.0);
    } else if (e.code === 'ArrowRight' && !isTyping) {
      e.preventDefault();
      seekTo(state.currentTime + 1.0);
    }
  });
}

/**
 * Bootstrapping
 */
document.addEventListener('DOMContentLoaded', () => {
  // Setup SRT File upload listener
  const srtInput = document.getElementById('srt-file-input');
  if (srtInput) {
    srtInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        importSRTContent(event.target.result);
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  // Folder dropdown toggle
  const folderBtn = document.getElementById('folder-menu-btn');
  const folderDropdown = document.getElementById('folder-dropdown');
  if (folderBtn && folderDropdown) {
    folderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      folderDropdown.classList.toggle('hidden');
    });
    window.addEventListener('click', () => {
      folderDropdown.classList.add('hidden');
    });
  }

  // Initialize UI components
  initVideoPlayer();
  initTimeline();
  renderSubtitleTable();
  setupKeyboardShortcuts();
  checkBackendConnection();

  // Initial seek position
  seekTo(2.0);

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
