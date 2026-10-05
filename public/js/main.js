/**
 * Main Application Orchestrator for DAI Dubber Pro - Khmer Edition
 */
import { state, DEFAULT_DUBBING_SETTINGS, saveDubbingSettings } from './state.js';
import {
  renderSubtitleTable,
  addNewSubtitleRow,
  deleteSelectedSubtitles,
  selectAllSubtitles,
  setAllVoices,
  exportSRTFile,
  importSRTContent,
  triggerSRTUpload,
  exportJSONFile,
  importJSONContent,
  triggerJSONUpload,
  syncSubtitlesFromDOM,
  applySmartEndPadding,
  toggleSubtitleFullscreen,
  exitSubtitleFullscreen
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
  toggleMuteAudio,
  toggleIsolateBGM,
  loadVideoFromUrl,
  uploadVideoFileToServer,
  switchPreviewMode,
  cancelCurrentVideo,
  updateCancelVideoBtnVisibility,
  formatTimecodeDisplay
} from './video-player.js';

import { extractAudioChunksFromVideo, extractAudioFromVideo } from './audio-extractor.js';
import { parseTimecodeSRT, formatTimecodeSRT } from './subtitles.js';
import { logToTerminal } from './logger.js';

// Expose globally for HTML event attributes
window.state = state;
window.seekTo = seekTo;
window.togglePlay = togglePlay;
window.stopPlayback = stopPlayback;
window.toggleMuteAudio = toggleMuteAudio;
window.toggleIsolateBGM = toggleIsolateBGM;
window.addNewSubtitleRow = addNewSubtitleRow;
window.deleteSelectedSubtitles = deleteSelectedSubtitles;
window.selectAllSubtitles = selectAllSubtitles;
window.setAllVoices = setAllVoices;
window.exportSRTFile = exportSRTFile;
window.exportJSONFile = exportJSONFile;
window.importJSONContent = importJSONContent;
window.triggerJSONUpload = triggerJSONUpload;
window.syncSubtitlesFromDOM = syncSubtitlesFromDOM;
window.setTimelineZoom = setTimelineZoom;
window.startTranslation = startTranslation;
window.resetDubbingSettings = resetDubbingSettings;
window.applySmartEndPadding = applySmartEndPadding;
window.toggleSubtitleFullscreen = toggleSubtitleFullscreen;
window.exitSubtitleFullscreen = exitSubtitleFullscreen;
window.switchPreviewMode = switchPreviewMode;
window.cancelCurrentVideo = cancelCurrentVideo;
window.updateCancelVideoBtnVisibility = updateCancelVideoBtnVisibility;

/**
 * AI Audio Transcription Workflow:
 * Extract audio from video on browser -> POST /api/transcribe -> Gemini AI -> Populate Subtitles Table
 */
window.startTranscription = async function() {
  if (state.isTranscribing) {
    window.showToast('កំពុងដំណើរការ Transcription រួចហើយ សូមរង់ចាំ...');
    return;
  }

  if (!state.currentVideoFile && state.videoUrl) {
    try {
      window.showToast?.('📥 កំពុងទាញយកវីដេអូពី Server Storage...');
      const vRes = await fetch(state.videoUrl);
      if (vRes.ok) {
        const blob = await vRes.blob();
        state.currentVideoFile = new File([blob], state.videoName || 'project_video.mp4', { type: blob.type || 'video/mp4' });
      }
    } catch (e) {
      console.warn('Failed to fetch video from server storage:', e);
    }
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

    const activeModel = state.sttModel || 'groq-whisper-large-v3';
    const isGroq = activeModel.startsWith('groq');

    if (isGroq && !state.groqApiKey && !state.serverHasGroqKey) {
      window.showToast?.('⚠️ សូមបញ្ចូល Groq API Key នៅក្នុង Settings ឬក្នុង .env ជាមុនសិន ឬជ្រើសរើស Faster-Whisper (Offline)');
      window.openSettingsModal?.();
      state.isTranscribing = false;
      if (btn) {
        btn.removeAttribute('disabled');
        btn.classList.remove('opacity-70', 'cursor-wait');
      }
      if (btnText) btnText.textContent = 'Transcript';
      if (banner) banner.classList.add('hidden');
      return;
    }

    // 1. Client-side Single-Pass Audio Extraction (16kHz Mono WAV)
    logToTerminal('CLIENT:STATE', `User clicked [Transcript] button (Model: ${activeModel})`, {
      video: state.currentVideoFile?.name,
      size: `${(state.currentVideoFile?.size / (1024 * 1024)).toFixed(2)} MB`,
      model: activeModel
    });
    updateProgress('🎙️ កំពុងទាញយកសំឡេងពីវីដេអូ (Web Audio API 16kHz Mono)...');
    const audioBlob = await extractAudioFromVideo(state.currentVideoFile, (progressMsg) => {
      updateProgress(progressMsg);
    });

    // Reset subtitle table at start of fresh transcription
    state.subtitles = [];
    renderSubtitleTable();

    // 2. Single-pass upload to backend /api/transcribe
    logToTerminal('CLIENT:UPLOAD', `Uploading full audio (${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB) to backend /api/transcribe (Model: ${activeModel})...`);
    updateProgress(isGroq 
      ? `⚡ Groq Cloud Whisper កំពុងបំប្លែងសំឡេង (Ultra-fast Cloud)...` 
      : `🚀 Faster-Whisper [${activeModel}] កំពុងបំប្លែងសំឡេង (Local CPU $0)...`);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'extracted_audio.wav');
    formData.append('model', activeModel);
    if (state.groqApiKey) {
      formData.append('groqApiKey', state.groqApiKey);
    }
    if (state.geminiApiKey) {
      formData.append('apiKey', state.geminiApiKey);
    }
    const ds = state.dubbingSettings || {};
    if (ds.vadThreshold !== undefined) formData.append('vadThreshold', ds.vadThreshold);
    if (ds.maxPauseGap !== undefined) formData.append('maxPauseGap', ds.maxPauseGap);
    if (ds.maxMergeLimit !== undefined) formData.append('maxMergeLimit', ds.maxMergeLimit);

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      logToTerminal('CLIENT:ERROR', `Transcription failed: ${result.message}`);
      throw new Error(result.message || 'ការចម្លងសំឡេងមិនជោគជ័យ');
    }

    const segments = result.data;
    if (Array.isArray(segments) && segments.length > 0) {
      const parsedSubtitles = segments.map((item, segIndex) => {
        const rawStart = item.start || '00:00:00,000';
        const rawEnd = item.end || '00:00:05,000';
        const startSec = typeof item.startSec === 'number' ? item.startSec : parseTimecodeSRT(rawStart);
        const endSec = typeof item.endSec === 'number' ? item.endSec : parseTimecodeSRT(rawEnd);
        const startStr = formatTimecodeSRT(startSec);
        const endStr = formatTimecodeSRT(endSec);
        const speaker = item.speaker || 'Piseth (Male)';

        return {
          id: `sub-ai-${Date.now()}-${segIndex}`,
          selected: false,
          start: startStr,
          end: endStr,
          startSec: startSec,
          endSec: endSec,
          originalText: item.originalText || item.text || '',
          khmerText: item.khmerText || '',
          voice: speaker.includes('Female') ? 'Sreymom (Female)' : 'Piseth (Male)',
          status: 'Pending'
        };
      });

      // Smart Non-Overlapping End Padding:
      // Adds configured End Padding (e.g. +0.70s) to subtitle END times
      // without colliding or overlapping into the next row's START time.
      const endPaddingSec = typeof state.dubbingSettings?.endPadding === 'number'
        ? state.dubbingSettings.endPadding
        : 0.70;
      applySmartEndPadding(parsedSubtitles, endPaddingSec, state.duration || 0);

      logToTerminal('CLIENT:PADDING', `Applied smart end padding (+${endPaddingSec}s max) without overlap to ${parsedSubtitles.length} subtitles`);

      state.subtitles = parsedSubtitles;
      renderSubtitleTable();
      state.emit('subtitlesChanged', state.subtitles);

      logToTerminal('CLIENT:TABLE', `Rendered ${parsedSubtitles.length} subtitles into table`);
      logToTerminal('CLIENT:DONE', `Transcription pipeline complete. Total subtitles: ${parsedSubtitles.length}`);
      window.showToast?.(`🎉 បានចម្លង Subtitles សរុបចំនួន ${parsedSubtitles.length} ជួរជោគជ័យ!`);
    } else {
      logToTerminal('CLIENT:STATE', 'Transcription returned 0 spoken subtitles');
      window.showToast('⚠️ មិនមានសំឡេងនិយាយត្រូវបានរកឃើញក្នុងវីដេអូនេះទេ');
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
 * AI Translation Workflow:
 * Sends transcribed subtitles to Gemini AI to translate into natural Khmer -> Updates Table
 */
export async function startTranslation() {
  if (state.isTranslating) {
    window.showToast('កំពុងបកប្រែជាភាសាខ្មែរ សូមរង់ចាំ...');
    return;
  }

  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast('⚠️ មិនទាន់មាន Subtitles សម្រាប់បកប្រែទេ! សូមចុច Transcript ជាមុនសិន');
    return;
  }

  const btn = document.getElementById('btn-translate');
  const btnText = document.getElementById('translate-btn-text');

  try {
    state.isTranslating = true;
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Translating (2 Steps)...';
    window.showToast('🤖 កំពុងដំណើរការបកប្រែ ២ ជំហាន (2 Quotas): ចិន ➡️ អង់គ្លេស ➡️ ភាសានិយាយប្រែរឿងខ្មែរ...');
    logToTerminal('CLIENT:TRANSLATE', `Initiating 2-Step Translation Pipeline (2 Quotas) for ${state.subtitles.length} subtitles...`);

    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subtitles: state.subtitles.map(s => ({
          id: s.id,
          start: s.start,
          end: s.end,
          startSec: s.startSec,
          endSec: s.endSec,
          originalText: s.originalText || s.text || '',
          khmerText: s.khmerText || '',
          englishText: s.englishText || ''
        })),
        apiKey: state.geminiApiKey || null,
        endPadding: state.dubbingSettings?.endPadding ?? 0.70
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Gemini Translation failed');
    }

    const translatedList = result.data;
    if (Array.isArray(translatedList)) {
      translatedList.forEach((item, idx) => {
        if (state.subtitles[idx]) {
          if (item.khmerText) state.subtitles[idx].khmerText = item.khmerText;
          if (item.englishText) state.subtitles[idx].englishText = item.englishText;
        }
      });
      renderSubtitleTable();
      state.emit('subtitlesChanged', state.subtitles);
      window.triggerProjectAutoSave?.();
      logToTerminal('CLIENT:TRANSLATE_OK', `Successfully updated ${translatedList.length} subtitles with 2-Separate-Step translation (English + Khmer)`);
      window.showToast(`🎉 បានបកប្រែ ២ ជំហានជោគជ័យ ${translatedList.length} ជួរ (ចិន ➡️ អង់គ្លេស ➡️ ភាសានិយាយប្រែរឿង)!`);
    }
  } catch (err) {
    console.error('Translation error:', err);
    logToTerminal('CLIENT:TRANSLATE_FAIL', err.message);
    window.showToast(`❌ បរាជ័យក្នុងការបកប្រែ៖ ${err.message}`);
  } finally {
    state.isTranslating = false;
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Translate';
  }
}

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
 * Video & Subtitle File trigger helpers
 */
window.triggerVideoUpload = function() {
  document.getElementById('video-file-input')?.click();
};

window.triggerJSONUpload = function() {
  const jsonInput = document.getElementById('json-file-input') || document.getElementById('srt-file-input');
  if (jsonInput) {
    jsonInput.value = '';
    jsonInput.click();
  }
};

window.triggerSRTUpload = function() {
  const srtInput = document.getElementById('srt-file-input') || document.getElementById('json-file-input');
  if (srtInput) {
    srtInput.value = '';
    srtInput.click();
  }
};

window.loadDemoBGM = function() {
  window.showToast('បានផ្ទុកភ្លេង Khmer Traditional & Ambient BGM Track');
};



window.mockTranscribe = function() {
  window.showToast('🎙️ AI Speech Recognition កំពុងវិភាគសំឡេងវីដេអូ...');
  setTimeout(() => {
    window.showToast('✅ បានបង្កើត Subtitle ភាសាខ្មែរជោគជ័យ!');
  }, 1600);
};

function getFreshSubtitlePayloadItem(s) {
  // Freshly read current values from table inputs if rendered in DOM
  const startInput = document.querySelector(`.sub-time-input[data-id="${s.id}"][data-field="start"]`);
  const endInput = document.querySelector(`.sub-time-input[data-id="${s.id}"][data-field="end"]`);
  const textInput = document.querySelector(`.sub-text-input[data-id="${s.id}"]`);

  const rawStart = startInput ? startInput.value.trim() : (s.start || '00:00:00,000');
  const rawEnd = endInput ? endInput.value.trim() : (s.end || '00:00:00,000');
  const rawText = textInput ? textInput.value.trim() : (s.khmerText || '').trim();

  const freshStartSec = parseTimecodeSRT(rawStart);
  const freshEndSec = parseTimecodeSRT(rawEnd);

  s.start = formatTimecodeSRT(freshStartSec);
  s.end = formatTimecodeSRT(freshEndSec);
  s.startSec = freshStartSec;
  s.endSec = freshEndSec;
  s.khmerText = rawText;

  let tDur = null;
  if (freshEndSec > freshStartSec) {
    tDur = Math.round((freshEndSec - freshStartSec) * 1000) / 1000;
  }

  return {
    id: s.id,
    khmerText: rawText,
    voice: s.voice || 'Piseth (Male)',
    startSec: freshStartSec,
    endSec: freshEndSec,
    targetDuration: tDur,
    oldAudioUrl: s.oldAudioUrl || s.audioUrl || null
  };
}

window.generateAllVoice = async function() {
  if (state.isGeneratingVoice) return;

  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast('⚠️ មិនទាន់មាន Subtitles សម្រាប់បង្កើតសំឡេងទេ!');
    return;
  }

  // Filter subtitles that have khmerText
  const validItems = state.subtitles.filter(s => (s.khmerText || '').trim().length > 0);
  if (validItems.length === 0) {
    window.showToast('⚠️ សូមចុច Translate ឬបញ្ចូលអត្ថបទខ្មែរជាមុនសិន!');
    return;
  }

  const btn = document.getElementById('btn-generate-voice');
  const btnText = document.getElementById('generate-voice-text');

  try {
    state.isGeneratingVoice = true;
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Generating...';

    window.showToast('🚀 កំពុងដំណើរការ Microsoft Edge TTS (Piseth & Sreymom)...');
    logToTerminal('CLIENT:TTS', `Sending ${validItems.length} items to Edge TTS voice generator...`);

    const payload = {
      items: validItems.map(getFreshSubtitlePayloadItem)
    };

    const response = await fetch('/api/generate-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Voice generation failed');
    }

    const voiceResults = result.data || [];
    const voiceMap = {};
    voiceResults.forEach(r => {
      voiceMap[r.id] = r;
    });

    let updatedCount = 0;
    state.subtitles.forEach(sub => {
      const vRes = voiceMap[sub.id];
      if (vRes && vRes.success) {
        sub.status = 'Ready';
        sub.needsRegenerate = false;
        delete sub.oldAudioUrl;
        sub.audioUrl = vRes.audioUrl;
        sub.audioDuration = vRes.duration;
        sub.targetDuration = vRes.targetDuration || null;
        sub.speedApplied = vRes.speedApplied || 1.0;
        updatedCount++;
      }
    });

    renderSubtitleTable();
    state.emit('subtitlesChanged', state.subtitles);
    logToTerminal('CLIENT:TTS_OK', `Successfully generated ${updatedCount} Khmer voice files in storage/voices/`);
    window.showToast(`🎉 បានបង្កើតសំឡេង AI ជោគជ័យចំនួន ${updatedCount} ជួរ! អាចចុចស្តាប់បានហើយ`);

  } catch (err) {
    console.error('Voice generation error:', err);
    logToTerminal('CLIENT:TTS_ERR', err.message);
    window.showToast(`❌ បរាជ័យក្នុងការបង្កើតសំឡេង៖ ${err.message}`);
  } finally {
    state.isGeneratingVoice = false;
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Generate Voice';
  }
};

/**
 * Targeted Re-Generate Voice CTA:
 * Generates speech ONLY for checked (selected) rows, deletes old audio file, and restores Sound icon to Green.
 */
window.reGenerateSelectedVoices = async function() {
  if (state.isGeneratingVoice) return;

  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast('⚠️ មិនទាន់មាន Subtitles សម្រាប់បង្កើតសំឡេងទេ!');
    return;
  }

  // Filter subtitles that are checked (selected) AND have khmerText
  const selectedItems = state.subtitles.filter(s => s.selected && (s.khmerText || '').trim().length > 0);
  if (selectedItems.length === 0) {
    window.showToast('⚠️ សូមជ្រើសរើស (Check) ជួរ Subtitle ដែលចង់ Re-Generate ជាមុនសិន!');
    return;
  }

  const btn = document.getElementById('btn-regenerate-voice');
  const btnText = document.getElementById('regenerate-voice-text');

  try {
    state.isGeneratingVoice = true;
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Re-Generating...';

    window.showToast(`🚀 កំពុង Re-Generate សំឡេងខ្មែរចំនួន ${selectedItems.length} ជួរ...`);
    logToTerminal('CLIENT:TTS_REGEN', `Re-generating voice for ${selectedItems.length} checked subtitle items...`);

    const payload = {
      items: selectedItems.map(getFreshSubtitlePayloadItem)
    };

    const response = await fetch('/api/generate-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Voice re-generation failed');
    }

    const voiceResults = result.data || [];
    const voiceMap = {};
    voiceResults.forEach(r => {
      voiceMap[r.id] = r;
    });

    let updatedCount = 0;
    state.subtitles.forEach(sub => {
      const vRes = voiceMap[sub.id];
      if (vRes && vRes.success) {
        sub.status = 'Ready';
        sub.needsRegenerate = false;
        sub.selected = false;
        delete sub.oldAudioUrl;
        sub.audioUrl = vRes.audioUrl;
        sub.audioDuration = vRes.duration;
        sub.targetDuration = vRes.targetDuration || null;
        sub.speedApplied = vRes.speedApplied || 1.0;
        updatedCount++;
      }
    });

    renderSubtitleTable();
    state.emit('subtitlesChanged', state.subtitles);
    logToTerminal('CLIENT:TTS_REGEN_OK', `Successfully re-generated ${updatedCount} Khmer voice files in storage/voices/`);
    window.showToast(`🎉 បាន Re-Generate សំឡេងថ្មីជោគជ័យចំនួន ${updatedCount} ជួរ!`);

  } catch (err) {
    console.error('Voice re-generation error:', err);
    logToTerminal('CLIENT:TTS_REGEN_ERR', err.message);
    window.showToast(`❌ បរាជ័យក្នុងការ Re-Generate សំឡេង៖ ${err.message}`);
  } finally {
    state.isGeneratingVoice = false;
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Re-Generate Voice';
  }
};

// Backward compatibility alias
window.generateAllAudio = window.generateAllVoice;

/**
 * Generate Finalized Dubbed Video with Mixed Khmer Audio & Ducked BGM via FFmpeg
 */
window.generateDubbedVideo = async function() {
  if (state.isGeneratingVideo) return;

  // 1. Pre-flight Analysis: Check Video
  if (!state.videoUrl) {
    window.showToast?.('⚠️ សូមបញ្ចូលវីដេអូជាមុនសិន! (Please import video first)');
    return;
  }

  // 2. Pre-flight Analysis: Check Subtitles
  if (!state.subtitles || state.subtitles.length === 0) {
    window.showToast?.('⚠️ មិនទាន់មាន Subtitles សម្រាប់បង្កើតវីដេអូទេ!');
    return;
  }

  // 3. Pre-flight Analysis: Check Khmer Text
  const validItems = state.subtitles.filter(s => (s.khmerText || '').trim().length > 0);
  if (validItems.length === 0) {
    window.showToast?.('⚠️ សូម Translate ឬបញ្ចូលអត្ថបទខ្មែរជាមុនសិន!');
    return;
  }

  // 4. Pre-flight Analysis: Check Voice Audio Files
  const missingVoiceItems = validItems.filter(s => !s.audioUrl || s.needsRegenerate);
  if (missingVoiceItems.length > 0) {
    window.showToast?.(`🎤 កំពុង Generate សំឡេងខ្មែរ ${missingVoiceItems.length} ឃ្លាដែលនៅសល់ជាមុនសិន...`);
    logToTerminal('CLIENT:VIDEO_GENERATE', `Pre-flight: Generating ${missingVoiceItems.length} missing voice segments first...`);
    await window.generateAllVoice();
  }

  // Re-verify that voices are ready
  const readyItems = state.subtitles.filter(s => s.audioUrl && (s.khmerText || '').trim().length > 0);
  if (readyItems.length === 0) {
    window.showToast?.('⚠️ មិនអាចបង្កើតវីដេអូបានទេ ព្រោះគ្មានសំឡេងខ្មែរដែល Ready!');
    return;
  }

  const btn = document.getElementById('btn-generate-video');
  const btnText = document.getElementById('generate-video-text');

  try {
    state.isGeneratingVideo = true;
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Rendering...';

    window.showToast?.('🚀 កំពុងវិភាគ Settings & Render វីដេអូ Dubbed (FFmpeg)...');
    logToTerminal('CLIENT:VIDEO_GENERATE', `Analyzing settings & sending ${readyItems.length} voice segments to FFmpeg...`);

    // Extract current dubbing settings
    const removeSpoken = document.getElementById('setting-remove-spoken')
      ? document.getElementById('setting-remove-spoken').checked
      : (state.dubbingSettings.removeSpokenVoice !== false);

    const bgVolume = document.getElementById('setting-bgm-volume')
      ? parseInt(document.getElementById('setting-bgm-volume').value, 10)
      : (state.dubbingSettings.bgVolume ?? 8);

    const payload = {
      videoUrl: state.videoUrl ? state.videoUrl.split('?')[0] : null,
      subtitles: readyItems.map(s => ({
        id: s.id,
        audioUrl: s.audioUrl ? s.audioUrl.split('?')[0] : null,
        startSec: s.startSec ?? parseTimecodeSRT(s.start),
        endSec: s.endSec ?? parseTimecodeSRT(s.end),
        speedApplied: s.speedApplied || 1.0
      })),
      settings: {
        removeSpoken,
        bgVolume,
        padBefore: 0.25,
        padAfter: 0.25,
        videoVolume: state.videoVolume ?? 1.0,
        dubVolume: state.dubVolume ?? 1.0
      }
    };

    logToTerminal('CLIENT:MUTE_VOICE_CONFIG', `Audio Ducking & Voice Muting Settings:`, {
      muteVoice: removeSpoken ? 'ENABLED (Muted during speech)' : 'DISABLED (Keep 100%)',
      bgmVolume: `${bgVolume}% (${bgVolume === 0 ? '100% Complete Silence' : `Suppressed to ${bgVolume}%`})`
    });

    const res = await fetch('/api/video/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Render failed');
    }

    state.dubbedVideoUrl = result.data.dubbedVideoUrl;
    logToTerminal('CLIENT:VIDEO_RENDER_SUCCESS', `Dubbed video generated: ${result.data.dubbedVideoUrl} (${result.data.sizeMb} MB)`);

    // Auto-save project so dubbedVideoUrl persists
    window.triggerProjectAutoSave?.(true);

    // Automatically switch preview to "After" tab
    if (window.switchPreviewMode) {
      window.switchPreviewMode('after');
    }

    window.showToast?.('🎉 បានបង្កើតវីដេអូ Dubbed ជោគជ័យ! បានប្តូរកុងតាក់ទៅ After ដោយស្វ័យប្រវត្តិ។');
  } catch (err) {
    console.error('Video generation error:', err);
    logToTerminal('CLIENT:VIDEO_GENERATE_ERR', `Video generation failed: ${err.message}`);
    window.showToast?.(`❌ បរាជ័យក្នុងការបង្កើតវីដេអូ៖ ${err.message}`);
  } finally {
    state.isGeneratingVideo = false;
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Generate Video';
  }
};

// STT Model Configuration and Selector Logic
const STT_MODEL_CONFIG = {
  'groq-whisper-large-v3': { label: 'Groq Large-v3 ⭐', icon: '⚡', color: 'text-emerald-400' },
  'groq-whisper-turbo': { label: 'Groq Turbo', icon: '⚡', color: 'text-emerald-400' },
  'gemini-stt': { label: 'Gemini STT', icon: '✨', color: 'text-indigo-400' },
  'deepgram-nova-3': { label: 'Deepgram Nova-3', icon: '🌐', color: 'text-indigo-400' },
  'deepgram-nova-2': { label: 'Deepgram Nova-2', icon: '🌐', color: 'text-indigo-400' },
  'small': { label: 'Whisper Small', icon: '💻', color: 'text-cyan-400' },
  'medium': { label: 'Whisper Medium', icon: '💻', color: 'text-cyan-400' },
  'large-v2': { label: 'Whisper Large-v2', icon: '💻', color: 'text-cyan-400' },
  'large-v3': { label: 'Whisper Large-v3', icon: '💻', color: 'text-cyan-400' },
  'base': { label: 'Whisper Base', icon: '💻', color: 'text-cyan-400' },
};

window.updateSttModelUI = function(modelKey) {
  const mKey = modelKey || state.sttModel || 'groq-whisper-large-v3';
  const cfg = STT_MODEL_CONFIG[mKey] || { label: mKey, icon: '⚡', color: 'text-emerald-400' };
  const labelEl = document.getElementById('stt-model-label');
  const iconEl = document.getElementById('stt-model-icon');
  if (labelEl) labelEl.textContent = cfg.label;
  if (iconEl) {
    iconEl.textContent = cfg.icon;
    iconEl.className = cfg.color;
  }

  // Update checkmarks in dropdown
  const options = document.querySelectorAll('.stt-option');
  options.forEach(opt => {
    const isCurrent = opt.getAttribute('data-model') === mKey;
    const check = opt.querySelector('.stt-check');
    if (check) {
      if (isCurrent) {
        check.classList.remove('hidden');
        opt.classList.add('bg-slate-800/80', 'font-medium');
      } else {
        check.classList.add('hidden');
        opt.classList.remove('bg-slate-800/80', 'font-medium');
      }
    }
  });
};

window.toggleSttModelDropdown = function(event) {
  event?.stopPropagation?.();
  const dropdown = document.getElementById('stt-model-dropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');
};

window.closeSttModelDropdown = function() {
  const dropdown = document.getElementById('stt-model-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
};

window.selectSttModel = function(modelKey) {
  state.sttModel = modelKey;
  try {
    localStorage.setItem('selected_stt_model', modelKey);
  } catch (_) {}
  window.updateSttModelUI(modelKey);
  window.closeSttModelDropdown();

  const cfg = STT_MODEL_CONFIG[modelKey] || { label: modelKey };
  window.showToast?.(`បានប្ដូរ AI Model: ${cfg.label}`);

  if (modelKey.startsWith('groq') && !state.groqApiKey) {
    setTimeout(() => {
      window.showToast?.('💡 អ្នកបានជ្រើសរើស Groq Cloud! សូមបញ្ចូល Groq API Key ក្នុង Settings។');
    }, 1200);
  }
};

// Close STT dropdown on outside click
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('stt-model-selector-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      window.closeSttModelDropdown();
    }
  });
}

// Modal helpers
window.openSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  const apiKeyInput = document.getElementById('input-gemini-api-key');
  const groqKeyInput = document.getElementById('input-groq-api-key');
  if (apiKeyInput) {
    apiKeyInput.value = state.geminiApiKey || '';
  }
  if (groqKeyInput) {
    groqKeyInput.value = state.groqApiKey || '';
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
  const groqKeyInput = document.getElementById('input-groq-api-key');
  if (apiKeyInput) {
    state.geminiApiKey = apiKeyInput.value.trim();
    localStorage.setItem('gemini_api_key', state.geminiApiKey);
  }
  if (groqKeyInput) {
    state.groqApiKey = groqKeyInput.value.trim();
    localStorage.setItem('groq_api_key', state.groqApiKey);
  }
  window.closeSettingsModal();
  window.showToast('បានរក្សាទុកការកំណត់ Workspace');
};

// Export Video Modal Logic
window.openExportModal = function() {
  const modal = document.getElementById('export-video-modal');
  if (!modal) return;

  const videoEl = document.getElementById('export-modal-video');
  const bannerEl = document.getElementById('export-no-video-banner');
  const fileNameInput = document.getElementById('export-file-name');
  const savePathInput = document.getElementById('export-save-path');
  const statusEl = document.getElementById('export-modal-status');

  if (statusEl) statusEl.classList.add('hidden');

  // Initialize file name
  if (fileNameInput) {
    if (!fileNameInput.value || fileNameInput.value.trim() === '') {
      if (state.videoName) {
        const baseName = state.videoName.replace(/\.[^/.]+$/, '');
        fileNameInput.value = `${baseName}_dubbed.mp4`;
      } else {
        fileNameInput.value = `dubbed_video_${Date.now().toString().slice(-4)}.mp4`;
      }
    }
  }

  // Ensure default save path if empty
  if (savePathInput && (!savePathInput.value || savePathInput.value.trim() === '')) {
    savePathInput.value = 'storage/exports';
  }

  // Check if dubbed video is generated
  if (state.dubbedVideoUrl) {
    if (videoEl) {
      videoEl.src = state.dubbedVideoUrl;
      videoEl.classList.remove('hidden');
    }
    bannerEl?.classList.add('hidden');
  } else {
    if (videoEl) {
      videoEl.src = '';
      videoEl.classList.add('hidden');
    }
    bannerEl?.classList.remove('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

window.closeExportModal = function() {
  const modal = document.getElementById('export-video-modal');
  const videoEl = document.getElementById('export-modal-video');
  if (videoEl) {
    videoEl.pause();
  }
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
};

window.resetExportPathToDefault = function() {
  const savePathInput = document.getElementById('export-save-path');
  if (savePathInput) {
    savePathInput.value = 'storage/exports';
    window.showToast?.('បានកំណត់ទីតាំងរក្សាទុកទៅ storage/exports');
  }
};

window.triggerGenerateFromExportModal = async function() {
  if (state.isGeneratingVideo) return;
  window.showToast?.('⚡ កំពុងដំណើរការ Generate Video ជាមុន...');
  await window.generateDubbedVideo?.();
  
  if (state.dubbedVideoUrl) {
    const videoEl = document.getElementById('export-modal-video');
    const bannerEl = document.getElementById('export-no-video-banner');
    if (videoEl) {
      videoEl.src = state.dubbedVideoUrl;
      videoEl.classList.remove('hidden');
    }
    bannerEl?.classList.add('hidden');
  }
};

window.confirmExportVideo = async function() {
  const sourceUrl = state.dubbedVideoUrl || state.videoUrl;
  if (!sourceUrl) {
    window.showToast?.('⚠️ មិនមានវីដេអូសម្រាប់ Export ទេ! សូម Upload វីដេអូជាមុនសិន');
    return;
  }

  if (!state.dubbedVideoUrl) {
    window.showToast?.('⚠️ មិនទាន់បាន Generate Video បញ្ចូលសំឡេងនៅឡើយទេ! សូម Generate ជាមុន');
    return;
  }

  const fileNameInput = document.getElementById('export-file-name');
  const savePathInput = document.getElementById('export-save-path');
  const qualitySelect = document.getElementById('export-quality-select');
  const btn = document.getElementById('btn-confirm-export');
  const btnText = document.getElementById('confirm-export-text');
  const btnIcon = document.getElementById('confirm-export-icon');
  const statusEl = document.getElementById('export-modal-status');
  const statusText = document.getElementById('export-modal-status-text');

  let rawFileName = fileNameInput?.value?.trim();
  if (!rawFileName) {
    rawFileName = (state.videoName ? state.videoName.replace(/\.[^/.]+$/, '') : 'dubbed_video') + '_dubbed.mp4';
  }
  if (!rawFileName.toLowerCase().endsWith('.mp4')) {
    rawFileName += '.mp4';
  }

  const exportPath = savePathInput?.value?.trim() || 'storage/exports';
  const quality = qualitySelect?.value || 'high';

  try {
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'កំពុង Export...';
    if (btnIcon) {
      btnIcon.setAttribute('data-lucide', 'loader-2');
      btnIcon.classList.add('animate-spin');
    }
    if (statusEl) {
      statusEl.classList.remove('hidden');
      if (statusText) statusText.textContent = `កំពុងដំណើរការ Export វីដេអូ (${quality})... សូមរង់ចាំបន្តិច`;
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    logToTerminal('CLIENT:VIDEO_EXPORT_START', `Starting video export: fileName=${rawFileName}, quality=${quality}, path=${exportPath}`);

    const res = await fetch('/api/video/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceVideoUrl: state.dubbedVideoUrl,
        fileName: rawFileName,
        exportPath: exportPath,
        quality: quality
      })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Export failed');
    }

    logToTerminal('CLIENT:VIDEO_EXPORT_SUCCESS', `Video exported: ${result.data.fileName} (${result.data.sizeMb} MB) at ${result.data.fullPath}`);

    // Trigger browser download
    const link = document.createElement('a');
    link.href = result.data.downloadUrl;
    link.download = result.data.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.showToast?.(`🎉 បាន Export វីដេអូជោគជ័យ! File: ${result.data.fileName} (${result.data.sizeMb} MB)`);

    setTimeout(() => {
      window.closeExportModal();
    }, 600);

  } catch (err) {
    console.error('Export video error:', err);
    logToTerminal('CLIENT:VIDEO_EXPORT_ERR', `Export video failed: ${err.message}`);
    window.showToast?.(`❌ បរាជ័យក្នុងការ Export វីដេអូ៖ ${err.message}`);
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Export & Download';
    if (btnIcon) {
      btnIcon.setAttribute('data-lucide', 'download');
      btnIcon.classList.remove('animate-spin');
    }
    if (statusEl) statusEl.classList.add('hidden');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
};

// ==========================================
// Data History Modal Logic
// ==========================================

window.openHistoryModal = async function() {
  const modal = document.getElementById('data-history-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  await window.loadAndRenderHistory();
};

window.closeHistoryModal = function() {
  window.closeHistoryPreview();
  const modal = document.getElementById('data-history-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
};

window.closeHistoryPreview = function() {
  const previewDrawer = document.getElementById('history-preview-drawer');
  const previewVideo = document.getElementById('history-preview-video');
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.src = '';
  }
  previewDrawer?.classList.add('hidden');
};

window.playHistoryVideo = function(url, title) {
  const previewDrawer = document.getElementById('history-preview-drawer');
  const previewTitle = document.getElementById('history-preview-title');
  const previewVideo = document.getElementById('history-preview-video');
  if (!previewDrawer || !previewVideo) return;

  if (previewTitle) previewTitle.textContent = title || 'Preview Video';
  previewVideo.src = url;
  previewDrawer.classList.remove('hidden');
  previewVideo.play().catch(() => {});

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

window.downloadHistoryVideo = function(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'dubbed_video.mp4';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.showToast?.(`📥 កំពុងទាញយក៖ ${fileName}`);
};

window.deleteHistoryVideo = async function(id, fileName) {
  const confirmed = window.confirm(`តើលោកអ្នកប្រាកដជាចង់លុបវីដេអូ "${fileName}" ចេញពី Disk និងប្រវត្តិមែនទេ?`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Failed to delete');
    }
    window.showToast?.(`🗑️ បានលុបវីដេអូ "${fileName}" ជោគជ័យ`);
    const previewVideo = document.getElementById('history-preview-video');
    if (previewVideo && previewVideo.src && previewVideo.src.includes(fileName)) {
      window.closeHistoryPreview();
    }
    await window.loadAndRenderHistory(true);
  } catch (err) {
    console.error('Delete history error:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការលុបវីដេអូ៖ ${err.message}`);
  }
};

window.clearAllHistoryData = async function() {
  const confirmed = window.confirm('⚠️ ការព្រមាន៖ តើលោកអ្នកពិតជាចង់លុបរាល់វីដេអូ Dubbed ទាំងអស់ចេញពីកុំព្យូទ័រមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយបានឡើយ។');
  if (!confirmed) return;

  try {
    const res = await fetch('/api/history/clear', { method: 'POST' });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Failed to clear');
    }
    window.closeHistoryPreview();
    window.showToast?.('🗑️ បានសម្អាតរាល់ប្រវត្តិវីដេអូទាំងអស់ជោគជ័យ');
    await window.loadAndRenderHistory(true);
  } catch (err) {
    console.error('Clear history error:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការសម្អាតប្រវត្តិ៖ ${err.message}`);
  }
};

window.loadAndRenderHistory = async function(silent = false) {
  const container = document.getElementById('history-items-container');
  const emptyBanner = document.getElementById('history-empty-banner');
  const headerCount = document.getElementById('history-header-count');
  const badgeCount = document.getElementById('history-badge-count');
  const headerStats = document.getElementById('history-header-stats');
  const footerSize = document.getElementById('history-footer-size');
  const clearBtn = document.getElementById('btn-clear-all-history');

  if (!silent && container) {
    container.innerHTML = `
      <div class="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-indigo-400"></i>
        <span>កំពុងទាញយកទិន្នន័យប្រវត្តិ...</span>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  try {
    const res = await fetch('/api/history');
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Failed to load history');
    }

    const { items = [], totalCount = 0, totalSizeMb = 0 } = result.data || {};

    // Update counts & badges
    if (headerCount) headerCount.textContent = `${totalCount} វីដេអូ`;
    if (footerSize) footerSize.textContent = `ទំហំសរុប៖ ${totalSizeMb} MB`;
    if (headerStats) headerStats.textContent = `មានវីដេអូសរុបចំនួន ${totalCount} ឯកសារ (ទំហំ Disk សរុប ${totalSizeMb} MB)`;

    if (badgeCount) {
      if (totalCount > 0) {
        badgeCount.textContent = totalCount > 99 ? '99+' : totalCount;
        badgeCount.classList.remove('hidden');
      } else {
        badgeCount.classList.add('hidden');
      }
    }

    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = '';
      emptyBanner?.classList.remove('hidden');
      clearBtn?.classList.add('hidden');
      return;
    }

    emptyBanner?.classList.add('hidden');
    clearBtn?.classList.remove('hidden');

    container.innerHTML = items.map((item) => {
      const isExport = item.type === 'export';
      const typeBadgeClass = isExport
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      const typeLabel = isExport ? 'Exported' : 'Generated';
      const qualityBadge = item.quality ? `<span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">${item.quality}</span>` : '';
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('km-KH', { dateStyle: 'short', timeStyle: 'short' }) : '';

      return `
        <div class="p-3 bg-slate-800/60 hover:bg-slate-800/90 rounded-xl border border-slate-700/70 hover:border-slate-600 transition flex items-center justify-between gap-3 group">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="p-2.5 rounded-lg bg-black/40 border border-slate-700/80 text-slate-300 shrink-0 group-hover:border-indigo-500/50 transition">
              <i data-lucide="${isExport ? 'file-video' : 'sparkles'}" class="w-4 h-4 ${isExport ? 'text-emerald-400' : 'text-indigo-400'}"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono text-xs font-medium text-white truncate max-w-md" title="${item.fileName}">${item.fileName}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded-full border font-medium ${typeBadgeClass}">${typeLabel}</span>
                ${qualityBadge}
              </div>
              <div class="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                <span class="flex items-center gap-1 font-mono"><i data-lucide="hard-drive" class="w-3 h-3 text-slate-500"></i> ${item.sizeMb || 0} MB</span>
                <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3 text-slate-500"></i> ${dateStr}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="playHistoryVideo('${item.url}', '${item.fileName}')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-700/80 hover:bg-indigo-600 text-slate-200 hover:text-white transition flex items-center gap-1 cursor-pointer text-[11px] font-medium"
              title="ចាក់មើលសាកល្បង (Play Preview)">
              <i data-lucide="play" class="w-3 h-3 fill-current"></i>
              <span>Play</span>
            </button>
            <button onclick="downloadHistoryVideo('${item.url}', '${item.fileName}')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-700/80 hover:bg-emerald-600 text-slate-200 hover:text-white transition flex items-center gap-1 cursor-pointer text-[11px] font-medium"
              title="ទាញយក (Download Video)">
              <i data-lucide="download" class="w-3 h-3"></i>
              <span>Download</span>
            </button>
            <button onclick="deleteHistoryVideo('${item.id}', '${item.fileName}')"
              class="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="លុបឯកសារនេះ (Delete Video)">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('Load history error:', err);
    if (container) {
      container.innerHTML = `
        <div class="py-8 text-center text-rose-400 space-y-1">
          <p class="font-medium text-xs">❌ បរាជ័យក្នុងការទាញយកប្រវត្តិវីដេអូ</p>
          <p class="text-[11px] text-slate-500">${err.message}</p>
        </div>
      `;
    }
  }
};

// ==========================================
// RVC Character Voice Library Management
// ==========================================

let rvcPreviewAudio = null;

window.openVoiceLibraryModal = async function() {
  const modal = document.getElementById('voice-library-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
  await window.loadRvcModels();
};

window.closeVoiceLibraryModal = function() {
  if (rvcPreviewAudio) {
    rvcPreviewAudio.pause();
    rvcPreviewAudio = null;
  }
  const modal = document.getElementById('voice-library-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
};

window.updateRvcPthLabel = function(input) {
  const label = document.getElementById('rvc-pth-label');
  if (!label) return;
  if (input.files && input.files[0]) {
    label.textContent = `✅ ${input.files[0].name} (${(input.files[0].size / (1024 * 1024)).toFixed(1)} MB)`;
    label.classList.add('text-purple-300');
  } else {
    label.textContent = 'ជ្រើសរើស File Model (.pth) *';
    label.classList.remove('text-purple-300');
  }
};

window.updateRvcIndexLabel = function(input) {
  const label = document.getElementById('rvc-index-label');
  if (!label) return;
  if (input.files && input.files[0]) {
    label.textContent = `✅ ${input.files[0].name} (${(input.files[0].size / (1024 * 1024)).toFixed(1)} MB)`;
    label.classList.add('text-indigo-300');
  } else {
    label.textContent = 'ជ្រើសរើស File Index (.index - ជម្រើសបន្ថែម)';
    label.classList.remove('text-indigo-300');
  }
};

window.loadRvcModels = async function() {
  const listContainer = document.getElementById('rvc-models-list');
  const countBadge = document.getElementById('voice-library-count');
  const bulkSelect = document.getElementById('bulk-character-voice-select');

  try {
    const res = await fetch('/api/rvc/models');
    const json = await res.json();
    const models = (json && json.success && Array.isArray(json.data)) ? json.data : [];
    state.rvcModels = models;

    if (countBadge) {
      countBadge.textContent = models.length;
    }

    // Update bulk select
    if (bulkSelect) {
      if (models.length > 0) {
        bulkSelect.classList.remove('hidden');
        bulkSelect.innerHTML = `<option value="">🎭 Select Character...</option>` +
          models.map(m => `<option value="${m.id}">🎭 ${m.name}</option>`).join('');
      } else {
        bulkSelect.classList.add('hidden');
      }
    }

    // Render list inside modal
    if (listContainer) {
      if (models.length === 0) {
        listContainer.innerHTML = `
          <div class="py-8 text-center text-slate-500 border border-slate-800/80 rounded-xl bg-slate-900/30 space-y-1">
            <i data-lucide="mic-off" class="w-7 h-7 mx-auto text-slate-600 mb-1"></i>
            <p class="text-xs font-medium text-slate-400">មិនទាន់មានសំឡេងតួអង្គនៅឡើយទេ</p>
            <p class="text-[10px] text-slate-500">អ្នកអាចទាញយក file .pth ពី Weights.gg រួច Upload ខាងលើដើម្បីប្រើប្រាស់</p>
          </div>
        `;
      } else {
        listContainer.innerHTML = models.map(m => {
          const sizeMb = (m.pthSize / (1024 * 1024)).toFixed(1);
          const genderBadge = m.gender === 'Female'
            ? '<span class="px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[9.5px]">👩 Female</span>'
            : '<span class="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9.5px]">👨 Male</span>';
          const pitchStr = m.pitchDefault !== 0 ? `<span class="text-[9.5px] font-mono text-purple-400">Pitch: ${m.pitchDefault > 0 ? '+' : ''}${m.pitchDefault}</span>` : '';

          return `
            <div class="p-2.5 bg-slate-800/60 hover:bg-slate-800/90 rounded-xl border border-slate-700/70 transition flex items-center justify-between gap-3 group">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-300 text-sm shrink-0">
                  🎭
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-xs text-white truncate">${m.name}</span>
                    ${genderBadge}
                    ${pitchStr}
                  </div>
                  <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                    <span>${sizeMb} MB</span>
                    ${m.indexFilename ? '<span class="text-emerald-400">✓ with Index</span>' : '<span class="text-slate-500">no index</span>'}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button onclick="window.testRvcPreview('${m.id}', '${m.name.replace(/'/g, "\\'")}')"
                  class="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-800/60 border border-purple-500/40 text-purple-200 hover:text-white transition flex items-center gap-1 text-[11px] cursor-pointer"
                  title="ស្ដាប់សំឡេងតេស្ត (Test Voice Preview)">
                  <i data-lucide="volume-2" class="w-3.5 h-3.5 text-purple-400"></i>
                  <span>Test</span>
                </button>
                <button onclick="window.deleteRvcModel('${m.id}', '${m.name.replace(/'/g, "\\'")}')"
                  class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition text-[11px] cursor-pointer"
                  title="លុបម៉ូដែល">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Refresh Subtitle table so voice dropdowns reflect current models
    if (state.subtitles && state.subtitles.length > 0) {
      renderSubtitleTable();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.warn('Failed to load RVC models:', err);
  }
};

window.uploadRvcModel = async function() {
  const nameInput = document.getElementById('rvc-input-name');
  const genderInput = document.getElementById('rvc-input-gender');
  const pitchInput = document.getElementById('rvc-input-pitch');
  const pthInput = document.getElementById('rvc-file-pth');
  const indexInput = document.getElementById('rvc-file-index');
  const statusSpan = document.getElementById('rvc-upload-status');
  const saveBtn = document.getElementById('btn-save-rvc-model');

  const name = nameInput?.value?.trim();
  if (!name) {
    window.showToast?.('⚠️ សូមបញ្ចូលឈ្មោះតួអង្គ (Character Name)');
    nameInput?.focus();
    return;
  }

  if (!pthInput?.files || !pthInput.files[0]) {
    window.showToast?.('⚠️ សូមជ្រើសរើស File Model (.pth)');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('gender', genderInput?.value || 'Male');
  formData.append('pitchDefault', pitchInput?.value || '0');
  formData.append('pth', pthInput.files[0]);
  if (indexInput?.files && indexInput.files[0]) {
    formData.append('index', indexInput.files[0]);
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (statusSpan) statusSpan.textContent = '⏳ កំពុង Upload និងដំឡើង Model...';
    window.showToast?.('⏳ កំពុង Upload និងដំឡើងសំឡេងតួអង្គ...');

    const res = await fetch('/api/rvc/models/upload', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Upload failed');
    }

    window.showToast?.(`🎉 ${json.message}`);
    // Clear inputs
    if (nameInput) nameInput.value = '';
    if (pthInput) pthInput.value = '';
    if (indexInput) indexInput.value = '';
    window.updateRvcPthLabel(pthInput);
    window.updateRvcIndexLabel(indexInput);
    if (statusSpan) statusSpan.textContent = '';

    await window.loadRvcModels();
  } catch (err) {
    console.error('Upload RVC model error:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការ Upload៖ ${err.message}`);
    if (statusSpan) statusSpan.textContent = `❌ ${err.message}`;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
};

window.deleteRvcModel = async function(id, name) {
  const confirmed = window.confirm(`តើអ្នកពិតជាចង់លុបសំឡេងតួអង្គ "${name}" ចេញពី Library មែនទេ?`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/rvc/models/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Delete failed');
    }
    window.showToast?.(`🗑️ បានលុបសំឡេងតួអង្គ "${name}" ជោគជ័យ`);
    await window.loadRvcModels();
  } catch (err) {
    console.error('Delete RVC model error:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការលុប៖ ${err.message}`);
  }
};

window.testRvcPreview = async function(id, name) {
  window.showToast?.(`⏳ កំពុង Render សំឡេងតេស្ត "${name}" លើ CPU...`);

  try {
    const res = await fetch('/api/rvc/test-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: id })
    });
    const json = await res.json();
    if (!res.ok || !json.success || !json.audioUrl) {
      throw new Error(json.message || 'Preview generation failed');
    }

    if (rvcPreviewAudio) {
      rvcPreviewAudio.pause();
    }
    rvcPreviewAudio = new Audio(json.audioUrl);
    await rvcPreviewAudio.play();
    window.showToast?.(`🔊 កំពុងចាក់សំឡេងតេស្ត "${name}" (${json.duration}s)`);
  } catch (err) {
    console.error('Test preview error:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការ Render សំឡេងតេស្ត៖ ${err.message}`);
  }
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
    const res = await fetch('/api/status');
    const data = await res.json();
    if (res.ok && data.success) {
      if (data.data && data.data.hasGroqKey) {
        state.serverHasGroqKey = true;
      }
      badge.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>Online</span>
      `;
      badge.className = "h-8 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 select-none";
    }
  } catch (e) {
    badge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
      <span>Local Offline</span>
    `;
    badge.className = "h-8 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 rounded-lg bg-amber-950/50 border border-amber-500/30 text-amber-400 select-none";
  }
}

/**
 * Dubbing Settings UI Controller
 */
export function initDubbingSettingsUI() {
  const s = state.dubbingSettings || { ...DEFAULT_DUBBING_SETTINGS };

  // 1. End Padding
  const endPaddingInput = document.getElementById('setting-end-padding');
  const endPaddingVal = document.getElementById('val-end-padding');
  if (endPaddingInput && endPaddingVal) {
    endPaddingInput.value = s.endPadding;
    endPaddingVal.textContent = `+${Number(s.endPadding).toFixed(2)}s`;
    endPaddingInput.oninput = (e) => {
      const val = parseFloat(e.target.value);
      state.dubbingSettings.endPadding = val;
      endPaddingVal.textContent = `+${val.toFixed(2)}s`;
      saveDubbingSettings(state.dubbingSettings);
    };
  }

  // 2. Max Merged Limit
  const maxMergeInput = document.getElementById('setting-max-merge');
  const maxMergeVal = document.getElementById('val-max-merge');
  if (maxMergeInput && maxMergeVal) {
    maxMergeInput.value = s.maxMergeLimit;
    maxMergeVal.textContent = `${s.maxMergeLimit} ឃ្លា`;
    maxMergeInput.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      state.dubbingSettings.maxMergeLimit = val;
      maxMergeVal.textContent = `${val} ឃ្លា`;
      saveDubbingSettings(state.dubbingSettings);
    };
  }

  // 3. Merge Gap
  const mergeGapInput = document.getElementById('setting-merge-gap');
  const mergeGapVal = document.getElementById('val-merge-gap');
  if (mergeGapInput && mergeGapVal) {
    mergeGapInput.value = s.maxPauseGap;
    mergeGapVal.textContent = `${Number(s.maxPauseGap).toFixed(2)}s`;
    mergeGapInput.oninput = (e) => {
      const val = parseFloat(e.target.value);
      state.dubbingSettings.maxPauseGap = val;
      mergeGapVal.textContent = `${val.toFixed(2)}s`;
      saveDubbingSettings(state.dubbingSettings);
    };
  }

  // 4. VAD Filter (Range Slider with Dynamic Color Badge)
  const vadSlider = document.getElementById('setting-vad-threshold');
  const vadVal = document.getElementById('val-vad-label');
  function updateVadBadge(val) {
    if (!vadVal) return;
    const num = parseFloat(val);
    const numStr = num.toFixed(2);
    const base = "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border transition-colors";

    if (num < 0.20) {
      // ពណ៌ស្វាយ (Violet): < 0.20 (ម៉ត់ខ្លាំង)
      vadVal.className = `${base} bg-violet-500/20 text-violet-400 border-violet-500/30`;
      vadVal.textContent = `${numStr} (ម៉ត់ខ្លាំង)`;
    } else if (num <= 0.40) {
      // ពណ៌ខៀវ (Sky/Blue): 0.20 - 0.40 (ល្មម)
      vadVal.className = `${base} bg-sky-500/20 text-sky-400 border-sky-500/30`;
      vadVal.textContent = `${numStr} (ល្មម)`;
    } else if (num <= 0.60) {
      // ពណ៌លឿង (Amber): 0.40 - 0.60 (ច្បាស់)
      vadVal.className = `${base} bg-amber-500/20 text-amber-400 border-amber-500/30`;
      vadVal.textContent = `${numStr} (ច្បាស់)`;
    } else {
      // ពណ៌ក្រហម (Rose/Red): > 0.60 (តឹងរ៉ឹង)
      vadVal.className = `${base} bg-rose-500/20 text-rose-400 border-rose-500/30`;
      vadVal.textContent = `${numStr} (តឹងរ៉ឹង)`;
    }
  }

  if (vadSlider && vadVal) {
    vadSlider.value = Number(s.vadThreshold).toFixed(2);
    updateVadBadge(s.vadThreshold);
    vadSlider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      state.dubbingSettings.vadThreshold = val;
      updateVadBadge(val);
      saveDubbingSettings(state.dubbingSettings);
    };
  }

  // 5. BGM Volume
  const bgmInput = document.getElementById('setting-bgm-volume');
  const bgmVal = document.getElementById('val-bgm-volume');
  if (bgmInput && bgmVal) {
    bgmInput.value = s.bgVolume;
    bgmVal.textContent = `${s.bgVolume}%`;
    bgmInput.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      state.dubbingSettings.bgVolume = val;
      bgmVal.textContent = `${val}%`;
      saveDubbingSettings(state.dubbingSettings);
      logToTerminal('SETTINGS:BGM_VOLUME', `BGM level changed to: ${val}% (Plays at ${val}% outside speech; 0% muted during speech)`);
      if (window.restoreVideoAudioDucking && !window.activeDubAudio) {
        window.restoreVideoAudioDucking();
      }
    };
  }

  // 6. Mute Original Voice
  const muteCheckbox = document.getElementById('setting-remove-spoken');
  const muteVal = document.getElementById('val-mute-spoken');
  if (muteCheckbox && muteVal) {
    muteCheckbox.checked = Boolean(s.removeSpokenVoice);
    muteVal.textContent = muteCheckbox.checked ? 'ON' : 'OFF';
    muteCheckbox.onchange = (e) => {
      const checked = e.target.checked;
      state.dubbingSettings.removeSpokenVoice = checked;
      muteVal.textContent = checked ? 'ON' : 'OFF';
      saveDubbingSettings(state.dubbingSettings);
      logToTerminal('SETTINGS:MUTE_VOICE', `Mute Original Voice switched to: ${checked ? 'ON' : 'OFF'} (BGM Level: ${state.dubbingSettings.bgVolume ?? 8}%)`);
      window.showToast?.(checked ? '🔇 បានបើក Mute Voice (លុបសំឡេងដើម)' : '🔊 បានបិទ Mute Voice (រក្សាសំឡេងដើម ១០០%)');
    };
  }
}

export function resetDubbingSettings() {
  state.dubbingSettings = { ...DEFAULT_DUBBING_SETTINGS };
  saveDubbingSettings(state.dubbingSettings);
  initDubbingSettingsUI();
  window.showToast?.('🎉 បានកំណត់ Dubbing Settings ត្រឡប់ទៅ Default វិញ!');
  logToTerminal('SETTINGS:RESET', 'Dubbing settings reset to defaults', state.dubbingSettings);
}

/**
 * Keyboard Shortcuts Setup
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Escape key exits Subtitle Fullscreen or open modals regardless of whether focus is in a field
    if (e.key === 'Escape' || e.code === 'Escape') {
      const section = document.getElementById('subtitle-section');
      if (section && section.classList.contains('subtitle-fullscreen-active')) {
        exitSubtitleFullscreen();
        return;
      }
      const exportModal = document.getElementById('export-video-modal');
      if (exportModal && !exportModal.classList.contains('hidden')) {
        window.closeExportModal();
        return;
      }
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        window.closeSettingsModal();
        return;
      }
      const historyModal = document.getElementById('data-history-modal');
      if (historyModal && !historyModal.classList.contains('hidden')) {
        window.closeHistoryModal();
        return;
      }
    }

    // Avoid triggering general playback shortcuts if typing in input / textarea / select
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
    } else if (e.code === 'KeyF' && !isTyping) {
      e.preventDefault();
      toggleSubtitleFullscreen();
    }
  });
}

/**
 * Dual-Layer Project Persistence Engine:
 * Layer 1: Synchronous LocalStorage (0ms latency, persists on immediate F5/refresh)
 * Layer 2: Server-side JSON storage at storage/projects/autosave_project.json
 */
let autoSaveTimer = null;

function getProjectPayload() {
  if (typeof syncSubtitlesFromDOM === 'function') {
    syncSubtitlesFromDOM();
  }
  return {
    video: {
      name: state.currentVideoFile?.name || state.videoName || '',
      duration: state.duration || 0,
      videoUrl: state.videoUrl || null,
      dubbedVideoUrl: state.dubbedVideoUrl || null,
      previewMode: state.previewMode || 'before'
    },
    subtitles: (state.subtitles || []).map(s => ({
      id: s.id,
      selected: Boolean(s.selected),
      start: s.start,
      end: s.end,
      startSec: s.startSec,
      endSec: s.endSec,
      originalText: s.originalText || '',
      englishText: s.englishText || '',
      khmerText: s.khmerText || '',
      voice: s.voice || 'Piseth (Male)',
      status: s.status || 'Pending',
      audioUrl: s.audioUrl || null,
      speedApplied: s.speedApplied || 1.0
    })),
    dubbingSettings: state.dubbingSettings || null
  };
}

window.triggerProjectAutoSave = function(immediate = false, allowEmpty = false) {
  // 1. Guard: Never auto-save while project is actively restoring from disk/local
  if (state.isRestoringProject) return;

  // 2. Guard: Never save empty state unless allowEmpty is true or video is loaded
  if (!allowEmpty && (!state.subtitles || state.subtitles.length === 0) && !state.videoUrl) {
    return;
  }

  const badge = document.getElementById('autosave-badge');
  const text = document.getElementById('autosave-text');

  function setSavingUI() {
    if (text) text.textContent = 'Saving...';
    if (badge) {
      badge.classList.remove('border-emerald-500/50', 'text-emerald-400');
      badge.classList.add('border-amber-500/40', 'text-amber-400');
    }
  }

  function setSavedUI() {
    if (text) text.textContent = 'Auto-Saved';
    if (badge) {
      badge.classList.remove('border-amber-500/40', 'text-amber-400');
      badge.classList.add('border-emerald-500/50', 'text-emerald-400');
    }
  }

  function setErrorUI() {
    if (text) text.textContent = 'Save Error';
    if (badge) {
      badge.classList.remove('border-emerald-500/50', 'text-emerald-400');
      badge.classList.add('border-rose-500/40', 'text-rose-400');
    }
  }

  const payload = getProjectPayload();
  if (allowEmpty) {
    payload.isExplicitClear = true;
  } else if ((!payload.subtitles || payload.subtitles.length === 0)) {
    // Safety guard: Don't overwrite existing cached subtitles with empty array
    try {
      const cached = localStorage.getItem('dubber_autosave_project');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.subtitles) && parsed.subtitles.length > 0) {
          payload.subtitles = parsed.subtitles;
        }
      }
    } catch (_) {}
  }

  // LAYER 1: Synchronous localStorage write (immediate, immune to sudden refresh)
  try {
    localStorage.setItem('dubber_autosave_project', JSON.stringify(payload));
  } catch (err) {
    console.warn('localStorage autosave failed:', err);
  }

  // LAYER 2: Server-side JSON persistence
  const executeServerSave = async () => {
    try {
      setSavingUI();
      const res = await fetch('/api/project/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });

      if (res.ok) {
        setSavedUI();
        if (immediate) window.showToast?.('💾 បានរក្សាទុកគម្រោងលើ Server ជោគជ័យ!');
      } else {
        setErrorUI();
      }
    } catch (e) {
      console.error('AutoSave to server failed:', e);
      setErrorUI();
    }
  };

  if (immediate) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    executeServerSave();
  } else {
    setSavingUI();
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(executeServerSave, 500);
  }
};

// Immediate flush on tab close / page refresh
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (!state.isRestoringProject && ((state.subtitles && state.subtitles.length > 0) || state.videoUrl)) {
      if (typeof syncSubtitlesFromDOM === 'function') {
        syncSubtitlesFromDOM();
      }
      const payload = getProjectPayload();
      try {
        localStorage.setItem('dubber_autosave_project', JSON.stringify(payload));
      } catch (_) {}
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/project/save', blob);
      } catch (_) {}
    }
  });
}

/**
 * Auto-Restore Project on page load / refresh (F5)
 * Dual-stage: Instant localStorage restoration followed by server-side verification
 */
window.loadSavedProject = async function() {
  state.isRestoringProject = true;
  try {
    // 1. Synchronously restore from localStorage (Immediate 0ms, eliminates blank table flash)
    let localData = null;
    try {
      const cached = localStorage.getItem('dubber_autosave_project');
      if (cached) localData = JSON.parse(cached);
    } catch (_) {}

    if (localData) {
      if (localData.video) {
        state.duration = localData.video.duration || 0;
        state.videoName = localData.video.name || '';
        state.videoUrl = localData.video.videoUrl || null;
        state.dubbedVideoUrl = localData.video.dubbedVideoUrl || null;
        if (state.videoUrl && window.loadVideoFromUrl) {
          window.loadVideoFromUrl(state.videoUrl, state.videoName, state.duration);
        }
        if (localData.video.previewMode === 'after' && state.dubbedVideoUrl && window.switchPreviewMode) {
          setTimeout(() => window.switchPreviewMode('after'), 150);
        }
        const totalElem = document.getElementById('timecode-total');
        if (totalElem && state.duration > 0 && typeof formatTimecodeDisplay === 'function') {
          totalElem.textContent = formatTimecodeDisplay(state.duration);
        }
      }
      if (Array.isArray(localData.subtitles) && localData.subtitles.length > 0) {
        state.subtitles = localData.subtitles;
        renderSubtitleTable();
        logToTerminal('CLIENT:PROJECT_LOAD', `Instantly restored ${localData.subtitles.length} subtitles from local storage`);
      }
      if (localData.dubbingSettings) {
        state.dubbingSettings = { ...state.dubbingSettings, ...localData.dubbingSettings };
      }
    }

    // 2. Fetch authoritative project state from backend server file
    const res = await fetch('/api/project/load');
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.data) {
        const proj = json.data;
        if (proj.video) {
          state.duration = proj.video.duration || state.duration || 0;
          state.videoName = proj.video.name || state.videoName || '';
          state.videoUrl = proj.video.videoUrl || state.videoUrl || null;
          state.dubbedVideoUrl = proj.video.dubbedVideoUrl || state.dubbedVideoUrl || null;
          if (state.videoUrl && window.loadVideoFromUrl && (!state.videoName || !localData?.video)) {
            window.loadVideoFromUrl(state.videoUrl, state.videoName, state.duration);
          }
          if (proj.video.previewMode === 'after' && state.dubbedVideoUrl && window.switchPreviewMode) {
            setTimeout(() => window.switchPreviewMode('after'), 150);
          }
          const totalElem = document.getElementById('timecode-total');
          if (totalElem && state.duration > 0 && typeof formatTimecodeDisplay === 'function') {
            totalElem.textContent = formatTimecodeDisplay(state.duration);
          }
        }
        // If server has subtitles, ALWAYS restore them if local was empty or server has data
        if (Array.isArray(proj.subtitles) && proj.subtitles.length > 0) {
          state.subtitles = proj.subtitles;
          renderSubtitleTable();
          logToTerminal('CLIENT:PROJECT_LOAD', `Auto-restored project with ${proj.subtitles.length} subtitles from server`);
          window.showToast?.(`🔄 បានទាញយកគម្រោងមកវិញស្វ័យប្រវត្តិ (${proj.subtitles.length} Subtitles)`);
        }
        if (proj.dubbingSettings) {
          state.dubbingSettings = { ...state.dubbingSettings, ...proj.dubbingSettings };
        }
        // Update local storage to stay in sync with server
        try {
          localStorage.setItem('dubber_autosave_project', JSON.stringify({
            video: {
              name: state.videoName,
              duration: state.duration,
              videoUrl: state.videoUrl,
              dubbedVideoUrl: state.dubbedVideoUrl,
              previewMode: state.previewMode
            },
            subtitles: state.subtitles,
            dubbingSettings: state.dubbingSettings
          }));
        } catch (_) {}
      }
    }

    // Always render subtitle table once after checking both local and server
    renderSubtitleTable();
    if (state.subtitles && state.subtitles.length > 0) {
      state.emit('subtitlesChanged', state.subtitles);
    }
  } catch (err) {
    console.warn('Failed to auto-load project:', err);
    renderSubtitleTable();
  } finally {
    // Keep isRestoringProject true for a safety grace period so onloadedmetadata won't trigger premature autosave
    setTimeout(() => {
      state.isRestoringProject = false;
      window.updateCancelVideoBtnVisibility?.();
    }, 600);
  }
};

/**
 * Bootstrapping
 */
async function bootstrapApp() {
  // Setup Subtitle JSON & SRT File upload listeners
  const handleSubtitleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (file.name.toLowerCase().endsWith('.srt') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        importSRTContent(text);
      } else {
        importJSONContent(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const jsonInput = document.getElementById('json-file-input');
  if (jsonInput) {
    jsonInput.addEventListener('change', (e) => {
      handleSubtitleFile(e.target.files[0]);
    });
  }

  const srtInput = document.getElementById('srt-file-input');
  if (srtInput) {
    srtInput.addEventListener('change', (e) => {
      handleSubtitleFile(e.target.files[0]);
    });
  }

  // Initialize UI components
  try {
    initVideoPlayer();
    initTimeline();
    initDubbingSettingsUI();
    setupKeyboardShortcuts();
    checkBackendConnection();
    window.loadAndRenderHistory?.(true);
    window.loadRvcModels?.();
    window.updateSttModelUI?.(state.sttModel);

    // Auto-restore project from localStorage & server on startup
    await window.loadSavedProject();

    // Hook auto-save to state events
    state.on('subtitlesChanged', () => {
      window.triggerProjectAutoSave?.();
    });
    state.on('dubbingSettingsChanged', () => {
      window.triggerProjectAutoSave?.();
    });
    state.on('videoLoaded', () => {
      window.triggerProjectAutoSave?.();
    });
    state.on('durationChanged', () => {
      window.triggerProjectAutoSave?.();
    });

    // Initial seek position
    seekTo(0.0);
  } catch (err) {
    console.error('App initialization error:', err);
  } finally {
    // Always render Lucide icons even if non-critical components hit warnings
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
