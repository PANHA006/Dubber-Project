/**
 * Video Player Module: HTML5 Video handling, Canvas Visualizer fallback,
 * Overlay Sync, and Video Tools (Flip, Rotate, Aspect Ratio, Audio Mute)
 */
import { state } from './state.js';
import { logToTerminal } from './logger.js';

let animationFrameId = null;
let lastTimestamp = null;

export function formatTimecodeDisplay(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export async function uploadVideoFileToServer(file) {
  if (!file) return;
  try {
    state.isUploadingVideo = true;
    logToTerminal('CLIENT:VIDEO_UPLOAD', `Uploading video "${file.name}" to server storage/videos...`);
    const formData = new FormData();
    formData.append('video', file);

    const res = await fetch('/api/video/upload', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (res.ok && result.success && result.data) {
      state.videoUrl = result.data.videoUrl;
      state.videoName = result.data.originalName || file.name;
      logToTerminal('CLIENT:VIDEO_PERSISTED', `Video saved to server: ${result.data.videoUrl} (${result.data.sizeMb} MB)`);
      window.triggerProjectAutoSave?.();
    } else {
      console.warn('Video upload response not ok:', result);
    }
  } catch (err) {
    console.warn('Background video upload failed:', err);
  } finally {
    state.isUploadingVideo = false;
  }
}

export function loadVideoFromUrl(url, name = '', duration = 0) {
  const mainVideo = document.getElementById('main-video');
  if (!mainVideo || !url) return;

  state.videoUrl = url;
  if (name) state.videoName = name;
  if (duration > 0) {
    state.duration = duration;
    const totalElem = document.getElementById('timecode-total');
    if (totalElem) totalElem.textContent = formatTimecodeDisplay(duration);
  }

  mainVideo.src = url;
  mainVideo.load();
  mainVideo.classList.remove('hidden');
  document.getElementById('preview-canvas')?.classList.add('hidden');
  document.getElementById('no-video-placeholder')?.classList.add('hidden');

  const btnTranscribe = document.getElementById('btn-transcribe');
  if (btnTranscribe) {
    btnTranscribe.removeAttribute('disabled');
    btnTranscribe.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  mainVideo.onloadedmetadata = () => {
    state.duration = mainVideo.duration || duration || 0.0;
    const totalElem = document.getElementById('timecode-total');
    if (totalElem) totalElem.textContent = formatTimecodeDisplay(state.duration);
    const resElem = document.getElementById('video-resolution');
    if (resElem) resElem.textContent = `${mainVideo.videoWidth}x${mainVideo.videoHeight}`;
    updateCancelVideoBtnVisibility();
    state.emit('durationChanged', state.duration);
    logToTerminal('CLIENT:VIDEO_RESTORE', `Video preview restored from server storage: "${state.videoName || url}" (${state.duration.toFixed(1)}s)`);
  };
}

/**
 * Switch preview mode between 'before' (original video) and 'after' (dubbed video)
 * Seamlessly preserves current timestamp so user can compare at the exact same scene
 */
export function switchPreviewMode(mode) {
  const mainVideo = document.getElementById('main-video');
  const btnBefore = document.getElementById('btn-preview-before');
  const btnAfter = document.getElementById('btn-preview-after');
  const resElem = document.getElementById('video-resolution');

  if (mode === 'after') {
    if (!state.dubbedVideoUrl) {
      window.showToast?.('⚠️ មិនទាន់មានវីដេអូ Dubbed នៅឡើយទេ! សូមចុចប៊ូតុង [Generate Video] ខាងក្រោមជាមុនសិន');
      return;
    }

    if (state.previewMode === 'after' && mainVideo && mainVideo.src.includes(state.dubbedVideoUrl)) return;

    const curTime = mainVideo ? mainVideo.currentTime : state.currentTime;
    const wasPlaying = mainVideo ? !mainVideo.paused : false;

    state.previewMode = 'after';
    stopDubVoicePlayback();

    // Update switcher styling
    if (btnAfter) {
      btnAfter.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-medium transition bg-emerald-600 text-white shadow-xs cursor-pointer active:scale-95';
    }
    if (btnBefore) {
      btnBefore.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-medium transition text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer active:scale-95';
    }
    if (resElem) {
      resElem.textContent = 'Dubbed HD';
      resElem.className = 'text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/40 font-medium';
    }

    if (mainVideo) {
      mainVideo.src = state.dubbedVideoUrl;
      const onLoaded = () => {
        mainVideo.currentTime = curTime;
        if (wasPlaying) mainVideo.play().catch(() => {});
        mainVideo.removeEventListener('loadedmetadata', onLoaded);
      };
      mainVideo.addEventListener('loadedmetadata', onLoaded);
      mainVideo.load();
    }

    window.showToast?.('✨ បានប្តូរទៅមើលវីដេអូ Dubbed (សំឡេងខ្មែរ AI)');
    logToTerminal('CLIENT:PREVIEW_SWITCH', `Switched preview mode to AFTER (Dubbed Video: ${state.dubbedVideoUrl})`);
  } else {
    // mode === 'before'
    if (state.previewMode === 'before' && mainVideo && mainVideo.src.includes(state.videoUrl)) return;

    const curTime = mainVideo ? mainVideo.currentTime : state.currentTime;
    const wasPlaying = mainVideo ? !mainVideo.paused : false;

    state.previewMode = 'before';

    // Update switcher styling
    if (btnBefore) {
      btnBefore.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-medium transition bg-indigo-600 text-white shadow-xs cursor-pointer active:scale-95';
    }
    if (btnAfter) {
      btnAfter.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-medium transition text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer active:scale-95';
    }
    if (resElem) {
      resElem.textContent = '1080p HD';
      resElem.className = 'text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60';
    }

    if (mainVideo && state.videoUrl) {
      mainVideo.src = state.videoUrl;
      const onLoaded = () => {
        mainVideo.currentTime = curTime;
        if (wasPlaying) mainVideo.play().catch(() => {});
        mainVideo.removeEventListener('loadedmetadata', onLoaded);
      };
      mainVideo.addEventListener('loadedmetadata', onLoaded);
      mainVideo.load();
    }

    window.showToast?.('🎬 បានប្តូរទៅមើលវីដេអូដើម (Original Video)');
    logToTerminal('CLIENT:PREVIEW_SWITCH', `Switched preview mode to BEFORE (Original Video: ${state.videoUrl})`);
  }
}

/**
 * Show or hide the Cancel/Remove video button based on whether a video is active
 */
export function updateCancelVideoBtnVisibility() {
  const btn = document.getElementById('btn-cancel-video');
  if (!btn) return;
  if (state.videoUrl || state.currentVideoFile) {
    btn.classList.remove('hidden');
    btn.classList.add('flex');
    window.lucide?.createIcons();
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('flex');
  }
}

/**
 * Cancel and remove current video from workspace to allow user to work on another video
 */
export async function cancelCurrentVideo() {
  if (!state.videoUrl && !state.currentVideoFile) {
    window.showToast?.('មិនមានវីដេអូសម្រាប់លុប/បោះបង់ទេ');
    return;
  }

  const confirmed = window.confirm(
    'តើលោកអ្នកពិតជាចង់បោះបង់ និងដកវីដេអូនេះចេញ ដើម្បីធ្វើការជាមួយវីដេអូថ្មីមែនទេ?\n(រាល់ទិន្នន័យ Subtitles បច្ចុប្បន្ននឹងត្រូវសម្អាត ដើម្បីរៀបចំសម្រាប់វីដេអូថ្មី)'
  );
  if (!confirmed) return;

  try {
    // 1. Stop playback & audio
    stopPlayback();
    stopDubVoicePlayback();

    const mainVideo = document.getElementById('main-video');
    if (mainVideo) {
      mainVideo.pause();
      mainVideo.removeAttribute('src');
      mainVideo.load();
      mainVideo.classList.add('hidden');
    }

    // 2. Show canvas & placeholder
    document.getElementById('preview-canvas')?.classList.remove('hidden');
    document.getElementById('no-video-placeholder')?.classList.remove('hidden');

    // 3. Reset file input & UI labels
    const videoInput = document.getElementById('video-file-input');
    if (videoInput) videoInput.value = '';

    const resElem = document.getElementById('video-resolution');
    if (resElem) {
      resElem.textContent = '1080p HD';
      resElem.className = 'text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60';
    }

    const curTimeElem = document.getElementById('timecode-current');
    if (curTimeElem) curTimeElem.textContent = '00:00.00';

    const totalTimeElem = document.getElementById('timecode-total');
    if (totalTimeElem) totalTimeElem.textContent = '00:00.00';

    const miniProgress = document.getElementById('video-preview-progress');
    if (miniProgress) miniProgress.style.width = '0%';

    const miniThumb = document.getElementById('video-preview-thumb');
    if (miniThumb) miniThumb.style.left = '0%';

    const subOverlay = document.getElementById('sub-overlay-text');
    if (subOverlay) subOverlay.textContent = '';

    const btnTranscribe = document.getElementById('btn-transcribe');
    if (btnTranscribe) {
      btnTranscribe.setAttribute('disabled', 'true');
      btnTranscribe.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // 4. Switch preview mode back to 'before'
    if (window.switchPreviewMode) {
      window.switchPreviewMode('before');
    }

    // 5. Reset state
    state.videoUrl = null;
    state.videoName = '';
    state.currentVideoFile = null;
    state.dubbedVideoUrl = null;
    state.duration = 0.0;
    state.currentTime = 0.0;
    state.subtitles = [];
    state.isPlaying = false;

    // 6. Update Cancel button visibility
    updateCancelVideoBtnVisibility();

    // 7. Re-render Subtitle Table (shows empty state)
    window.renderSubtitleTable?.();

    // 8. Clear localStorage & save empty project to server
    try {
      localStorage.removeItem('dubber_autosave_project');
    } catch (_) {}

    if (window.triggerProjectAutoSave) {
      window.triggerProjectAutoSave(true, true);
    } else {
      fetch('/api/project/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isExplicitClear: true,
          version: '1.0.0',
          savedAt: new Date().toISOString(),
          video: { name: '', videoUrl: null, dubbedVideoUrl: null, duration: 0, previewMode: 'before' },
          subtitles: [],
          dubbingSettings: state.dubbingSettings || {}
        })
      }).catch(e => console.warn('Failed to clear server project:', e));
    }

    logToTerminal('CLIENT:VIDEO_CANCELED', 'Current video removed from workspace. Ready for new video import.');
    window.showToast?.('🗑️ បានដកវីដេអូចេញរួចរាល់! លោកអ្នកអាចជ្រើសរើសវីដេអូថ្មីមកធ្វើការបាន។');
  } catch (err) {
    console.error('Error canceling video:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការដកវីដេអូ៖ ${err.message}`);
  }
}

if (typeof window !== 'undefined') {
  window.loadVideoFromUrl = loadVideoFromUrl;
  window.uploadVideoFileToServer = uploadVideoFileToServer;
  window.switchPreviewMode = switchPreviewMode;
  window.cancelCurrentVideo = cancelCurrentVideo;
  window.updateCancelVideoBtnVisibility = updateCancelVideoBtnVisibility;
}

export function initVideoPlayer() {
  const mainVideo = document.getElementById('main-video');
  const videoInput = document.getElementById('video-file-input');
  const previewCanvas = document.getElementById('preview-canvas');
  const playerViewport = document.getElementById('player-viewport');

  // Initial cancel button visibility check
  updateCancelVideoBtnVisibility();

  // 1. Click on player screen to toggle Play/Pause
  if (playerViewport) {
    playerViewport.style.cursor = 'pointer';
    playerViewport.addEventListener('click', (e) => {
      // Don't toggle if clicking on specific buttons/tools or placeholder
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('#no-video-placeholder')) return;
      togglePlay();
    });
  }

  // 1.1. Click on empty state placeholder to open file picker directly
  const placeholder = document.getElementById('no-video-placeholder');
  if (placeholder && videoInput) {
    placeholder.addEventListener('click', (e) => {
      e.stopPropagation();
      videoInput.click();
    });
  }

  // 1.2. Mini Interactive Timeline Scrubber
  const miniTimeline = document.getElementById('video-preview-timeline-wrapper');
  const miniProgress = document.getElementById('video-preview-progress');
  const miniThumb = document.getElementById('video-preview-thumb');
  const miniTooltip = document.getElementById('video-preview-tooltip');

  function updateMiniTimeline(time) {
    if (!miniProgress) return;
    if (!state.duration || state.duration <= 0) {
      miniProgress.style.width = '0%';
      if (miniThumb) miniThumb.style.left = '0%';
      return;
    }
    const pct = Math.max(0, Math.min(100, (time / state.duration) * 100));
    miniProgress.style.width = `${pct}%`;
    if (miniThumb) miniThumb.style.left = `${pct}%`;
  }

  state.on('timeUpdated', (time) => {
    updateMiniTimeline(time);
  });

  state.on('durationChanged', () => {
    updateMiniTimeline(state.currentTime);
  });

  if (miniTimeline) {
    let isDragging = false;
    const handleSeek = (e) => {
      if (!state.duration || state.duration <= 0) return;
      const rect = miniTimeline.getBoundingClientRect();
      if (rect.width <= 0) return;
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const seekPercent = clickX / rect.width;
      const targetTime = seekPercent * state.duration;
      seekTo(targetTime);
    };

    miniTimeline.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isDragging = true;
      handleSeek(e);
    });

    miniTimeline.addEventListener('mousemove', (e) => {
      if (!state.duration || state.duration <= 0) return;
      const rect = miniTimeline.getBoundingClientRect();
      if (rect.width <= 0) return;
      const mouseX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const hoverPct = mouseX / rect.width;
      const hoverTime = hoverPct * state.duration;
      if (miniTooltip) {
        miniTooltip.style.left = `${mouseX}px`;
        miniTooltip.textContent = formatTimecodeDisplay(hoverTime);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        handleSeek(e);
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // 2. Video input change (Load Video)
  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      state.currentVideoFile = file;
      state.videoName = file.name;
      logToTerminal('CLIENT:STATE', `Selected video file: "${file.name}"`, {
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        type: file.type || 'video/mp4'
      });
      const url = URL.createObjectURL(file);
      mainVideo.src = url;
      mainVideo.load();
      mainVideo.classList.remove('hidden');
      previewCanvas?.classList.add('hidden');
      document.getElementById('no-video-placeholder')?.classList.add('hidden');

      // Asynchronously upload video to server for permanent storage
      uploadVideoFileToServer(file);

      // Update Transcript button status
      const btnTranscribe = document.getElementById('btn-transcribe');
      if (btnTranscribe) {
        btnTranscribe.removeAttribute('disabled');
        btnTranscribe.classList.remove('opacity-50', 'cursor-not-allowed');
      }

      mainVideo.onloadedmetadata = () => {
        state.duration = mainVideo.duration || 0.0;
        document.getElementById('timecode-total').textContent = formatTimecodeDisplay(state.duration);
        document.getElementById('video-resolution').textContent = `${mainVideo.videoWidth}x${mainVideo.videoHeight}`;
        updateCancelVideoBtnVisibility();
        logToTerminal('CLIENT:STATE', `Video loaded: "${file.name}"`, {
          duration: `${state.duration.toFixed(1)}s (${formatTimecodeDisplay(state.duration)})`,
          resolution: `${mainVideo.videoWidth}x${mainVideo.videoHeight}`
        });
        window.showToast?.(`បានបញ្ចូលវីដេអូ៖ ${file.name}`);
        state.emit('durationChanged', state.duration);
        state.emit('videoLoaded', file);
      };
    });
  }

  // 3. HTML5 Native Video Event Listeners
  if (mainVideo) {
    // When video playback updates time naturally (smooth, hardware accelerated)
    mainVideo.addEventListener('timeupdate', () => {
      if (!mainVideo.src) return;
      state.currentTime = mainVideo.currentTime;
      
      const timeCurrent = document.getElementById('timecode-current');
      if (timeCurrent) timeCurrent.textContent = formatTimecodeDisplay(state.currentTime);

      updateActiveSubtitleDisplay();
      syncDubVoicePlayback(state.currentTime);
      state.emit('timeUpdated', state.currentTime);
    });

    // Sync play state icon when native video starts playing
    mainVideo.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayButtonUI(true);
      syncDubVoicePlayback(state.currentTime);
    });

    // Sync pause state icon when native video pauses
    mainVideo.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayButtonUI(false);
      pauseDubVoicePlayback();
    });

    // When video ends
    mainVideo.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayButtonUI(false);
      stopDubVoicePlayback();
      window.showToast?.('វីដេអូបានចាក់ចប់ Ended');
    });
  }

  // Window and container resize for canvas
  if (playerViewport && window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      resizeCanvas();
    });
    ro.observe(playerViewport);
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 100);

  // Listen to active subtitle updates
  state.on('activeSubtitleUpdate', () => {
    updateActiveSubtitleDisplay();
  });

  // Initialize Video Volume Control & restore saved volume level
  initVideoVolumeControls();
}

function updatePlayButtonUI(isPlaying) {
  const playIcon = document.getElementById('play-icon');
  if (playIcon) {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    window.lucide?.createIcons();
  }
}

export function seekTo(seconds) {
  state.currentTime = Math.max(0, Math.min(seconds, state.duration));
  
  const timeCurrent = document.getElementById('timecode-current');
  if (timeCurrent) timeCurrent.textContent = formatTimecodeDisplay(state.currentTime);

  const mainVideo = document.getElementById('main-video');
  if (mainVideo && mainVideo.src && !isNaN(mainVideo.duration)) {
    // Only update native video time when explicitly seeking
    if (Math.abs(mainVideo.currentTime - state.currentTime) > 0.15) {
      mainVideo.currentTime = state.currentTime;
    }
  }

  updateActiveSubtitleDisplay();
  syncDubVoicePlayback(state.currentTime);
  state.emit('timeUpdated', state.currentTime);
  drawCanvasPreview();
}

export function togglePlay() {
  const mainVideo = document.getElementById('main-video');
  const hasRealVideo = mainVideo && mainVideo.src && !isNaN(mainVideo.duration);

  if (hasRealVideo) {
    // Stop any mock canvas animation if running
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    if (mainVideo.paused) {
      mainVideo.play().then(() => {
        state.isPlaying = true;
        updatePlayButtonUI(true);
        syncDubVoicePlayback(state.currentTime);
        window.showToast?.('កំពុងចាក់ Playback');
      }).catch((err) => {
        console.warn('Autoplay restriction or play error:', err);
        // Fallback: If blocked due to audio, mute and play
        mainVideo.muted = true;
        mainVideo.play().then(() => {
          state.isPlaying = true;
          updatePlayButtonUI(true);
          syncDubVoicePlayback(state.currentTime);
          window.showToast?.('កំពុងចាក់ Playback (Muted)');
        }).catch((e) => {
          window.showToast?.('មិនអាចចាក់វីដេអូបានទេ៖ ' + e.message);
        });
      });
    } else {
      mainVideo.pause();
      state.isPlaying = false;
      updatePlayButtonUI(false);
      pauseDubVoicePlayback();
      window.showToast?.('ផ្អាកការចាក់ Paused');
    }
    return;
  }

  // Fallback for Demo Mode when NO video is loaded (Canvas visualizer only)
  state.isPlaying = !state.isPlaying;
  updatePlayButtonUI(state.isPlaying);

  if (state.isPlaying) {
    lastTimestamp = null;
    animationFrameId = requestAnimationFrame(mockPlaybackLoop);
    syncDubVoicePlayback(state.currentTime);
    window.showToast?.('កំពុងចាក់ Demo Playback');
  } else {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    pauseDubVoicePlayback();
    window.showToast?.('ផ្អាកការចាក់ Paused');
  }
}

export function stopPlayback() {
  state.isPlaying = false;
  updatePlayButtonUI(false);

  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const mainVideo = document.getElementById('main-video');
  if (mainVideo && mainVideo.src) {
    mainVideo.pause();
    mainVideo.currentTime = 0;
  }
  stopDubVoicePlayback();
  seekTo(0);
  window.showToast?.('បានបញ្ឈប់ការចាក់ Stopped');
}

/**
 * Mock playback loop ONLY for Demo canvas when no video file is selected
 */
function mockPlaybackLoop(timestamp) {
  if (!state.isPlaying) return;
  if (!lastTimestamp) lastTimestamp = timestamp;

  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  state.currentTime += delta;
  if (state.currentTime >= state.duration) {
    state.currentTime = 0;
  }

  const timeCurrent = document.getElementById('timecode-current');
  if (timeCurrent) timeCurrent.textContent = formatTimecodeDisplay(state.currentTime);

  updateActiveSubtitleDisplay();
  syncDubVoicePlayback(state.currentTime);
  state.emit('timeUpdated', state.currentTime);
  drawCanvasPreview();

  animationFrameId = requestAnimationFrame(mockPlaybackLoop);
}

export function updateActiveSubtitleDisplay() {
  const subOverlay = document.getElementById('sub-overlay-text');
  if (!subOverlay) return;

  const currentSub = state.subtitles.find(
    s => state.currentTime >= s.startSec && state.currentTime <= s.endSec
  );

  if (currentSub && currentSub.khmerText) {
    subOverlay.textContent = currentSub.khmerText;
    subOverlay.classList.remove('opacity-0');
  } else {
    subOverlay.classList.add('opacity-0');
  }
}

export function resizeCanvas() {
  const canvas = document.getElementById('preview-canvas');
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  drawCanvasPreview();
}

export function drawCanvasPreview() {
  const canvas = document.getElementById('preview-canvas');
  const mainVideo = document.getElementById('main-video');
  if (!canvas) return;

  if (mainVideo && mainVideo.src && !mainVideo.paused && !mainVideo.ended) {
    return;
  }

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  // Dark studio gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0c1222');
  grad.addColorStop(1, '#070a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Studio grid
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)';
  ctx.lineWidth = 1;
  const step = 28;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Waveform visualization when playing
  if (state.isPlaying) {
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const cy = h * 0.45;
    for (let x = 0; x < w; x += 4) {
      const wave = Math.sin(x * 0.04 + state.currentTime * 7) * 18 * Math.sin((x / w) * Math.PI);
      if (x === 0) ctx.moveTo(x, cy + wave);
      else ctx.lineTo(x, cy + wave);
    }
    ctx.stroke();
  }
}

// Audio controls

export function toggleMuteAudio() {
  state.isMuted = !state.isMuted;
  const mainVideo = document.getElementById('main-video');
  const btn = document.getElementById('btn-mute');
  const label = document.getElementById('mute-label');

  if (mainVideo) mainVideo.muted = state.isMuted;
  if (state.isMuted) {
    btn?.classList.add('bg-rose-950/50', 'border-rose-500');
    if (label) label.textContent = 'Muted';
    window.showToast?.('បានបិទសំឡេង (Muted)');
  } else {
    btn?.classList.remove('bg-rose-950/50', 'border-rose-500');
    if (label) label.textContent = 'Mute Audio';
    window.showToast?.('បានបើកសំឡេង (Unmuted)');
  }
}

export function toggleIsolateBGM() {
  state.isIsolated = !state.isIsolated;
  const btn = document.getElementById('btn-isolate');
  const label = document.getElementById('isolate-label');

  if (state.isIsolated) {
    btn?.classList.add('bg-indigo-950/60', 'border-indigo-500');
    if (label) label.textContent = 'BGM Isolated ✓';
    window.showToast?.('AI Vocal Remover: បានទាញយក BGM ដាច់ដោយឡែក');
  } else {
    btn?.classList.remove('bg-indigo-950/60', 'border-indigo-500');
    if (label) label.textContent = 'Isolate BGM';
    window.showToast?.('បានលុបការ Isolate BGM');
  }
}

// ============================================================================
// VIDEO PREVIEW VOLUME CONTROLLER ("សារេសម្លេង Video")
// ============================================================================

export function initVideoVolumeControls() {
  const savedVolumeFraction = state.videoVolume !== undefined ? state.videoVolume : 1.0;
  const savedPercent = Math.round(savedVolumeFraction * 100);
  setVideoVolume(savedPercent);
}

export function setVideoVolume(val) {
  const percent = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  const fraction = percent / 100;
  state.videoVolume = fraction;

  try {
    localStorage.setItem('video_preview_volume', fraction.toString());
  } catch (_) {}

  const mainVideo = document.getElementById('main-video');
  if (mainVideo) {
    mainVideo.volume = fraction;
    mainVideo.muted = fraction === 0;
  }

  updateVideoVolumeUI(percent);
}

export function toggleVideoVolumeMute() {
  const mainVideo = document.getElementById('main-video');
  const isCurrentlyMuted = state.videoVolume === 0 || (mainVideo && mainVideo.muted);

  if (!isCurrentlyMuted) {
    state._lastVideoVolume = state.videoVolume > 0 ? state.videoVolume : 1.0;
    setVideoVolume(0);
    window.showToast?.('🔇 បានបិទសំឡេងវីដេអូ (Muted)');
  } else {
    const restorePercent = Math.round((state._lastVideoVolume || 1.0) * 100);
    setVideoVolume(restorePercent > 0 ? restorePercent : 100);
    window.showToast?.('🔊 បានបើកសំឡេងវីដេអូ (Unmuted)');
  }
}

export function updateVideoVolumeUI(percent) {
  const slider = document.getElementById('video-volume-slider');
  const text = document.getElementById('video-volume-text');
  const icon = document.getElementById('video-volume-icon');

  if (slider && parseInt(slider.value, 10) !== percent) {
    slider.value = percent;
  }
  if (text) {
    text.textContent = `${percent}%`;
  }
  if (icon) {
    if (percent === 0) {
      icon.setAttribute('data-lucide', 'volume-x');
      icon.classList.add('text-rose-400');
      icon.classList.remove('text-slate-300', 'text-indigo-400');
    } else if (percent <= 50) {
      icon.setAttribute('data-lucide', 'volume-1');
      icon.classList.remove('text-rose-400');
      icon.classList.add('text-slate-300');
    } else {
      icon.setAttribute('data-lucide', 'volume-2');
      icon.classList.remove('text-rose-400');
      icon.classList.add('text-slate-300');
    }
    if (window.lucide) window.lucide.createIcons();
  }
}

// Expose on window for direct HTML inline attributes
window.setVideoVolume = setVideoVolume;
window.toggleVideoVolumeMute = toggleVideoVolumeMute;

// ============================================================================
// REAL-TIME AUDIO-VIDEO DUB VOICE SYNC ENGINE
// ============================================================================

let activeDubAudio = null;
let activeDubSubId = null;

export function stopDubVoicePlayback() {
  if (activeDubAudio) {
    try {
      activeDubAudio.pause();
      activeDubAudio.currentTime = 0;
    } catch (_) {}
    activeDubAudio = null;
    activeDubSubId = null;
  }
  // Restore video volume if ducked
  restoreVideoAudioDucking();
}

export function pauseDubVoicePlayback() {
  if (activeDubAudio && !activeDubAudio.paused) {
    try {
      activeDubAudio.pause();
    } catch (_) {}
  }
}

function applyVideoAudioDucking() {
  // In 'after' mode, the video has already been rendered with background ducking
  if (state.previewMode === 'after') return;
  const mainVideo = document.getElementById('main-video');
  if (mainVideo && !mainVideo.muted && state.videoVolume > 0) {
    if (state.dubbingSettings?.removeSpokenVoice) {
      // Mute Voice ON: completely mute original voice (100% silence) during speech
      mainVideo.volume = 0;
    } else {
      mainVideo.volume = state.videoVolume;
    }
  }
}

function restoreVideoAudioDucking() {
  const mainVideo = document.getElementById('main-video');
  if (mainVideo && !mainVideo.muted) {
    if (state.dubbingSettings?.removeSpokenVoice) {
      // Outside speech: restore to user-configured BGM Volume (e.g. 15% -> 0.15)
      const bgVol = typeof state.dubbingSettings.bgVolume === 'number' ? state.dubbingSettings.bgVolume : 8;
      const duckRatio = Math.max(0, Math.min(100, bgVol)) / 100;
      mainVideo.volume = state.videoVolume * duckRatio;
    } else {
      mainVideo.volume = state.videoVolume;
    }
  }
}

export function syncDubVoicePlayback(currentTime) {
  // In 'after' mode, the dubbed video already contains the mixed voice audio track.
  // Never play overlay voice clips in 'after' mode to prevent double/echo sound profile voice.
  if (state.previewMode === 'after') {
    if (activeDubAudio) {
      stopDubVoicePlayback();
    }
    return;
  }

  if (!state.isPlaying) {
    pauseDubVoicePlayback();
    return;
  }

  // Buffer Padding (0.25s before and after speech to eliminate breathing and reverb)
  const PAD_BEFORE = 0.25;
  const PAD_AFTER = 0.25;

  // Find active subtitle with generated audio covering currentTime
  const currentSub = state.subtitles.find(s => {
    return (s.audioUrl || s.status === 'Ready') &&
           currentTime >= (s.startSec - PAD_BEFORE) &&
           currentTime < (s.endSec + PAD_AFTER);
  });

  if (!currentSub) {
    // Outside any dubbed subtitle range -> pause/clear active dub audio & restore video volume
    if (activeDubAudio) {
      pauseDubVoicePlayback();
      activeDubAudio = null;
      activeDubSubId = null;
    }
    restoreVideoAudioDucking();
    return;
  }

  // Still within subtitle speech window: ensure original voice stays ducked/muted
  applyVideoAudioDucking();

  const audioUrl = currentSub.audioUrl || `/storage/voices/voice_${String(currentSub.id).replace(/[:/\\\s]/g, '_')}.mp3`;
  const timeOffset = Math.max(0, currentTime - currentSub.startSec);

  // If this subtitle audio is already active
  if (activeDubSubId === currentSub.id && activeDubAudio) {
    applyVideoAudioDucking();
    if (activeDubAudio.paused) {
      activeDubAudio.play().catch(() => {});
    }
    // Drift compensation: ONLY resync if audio has severely drifted (> 1.2s), e.g. user scrubbed timeline.
    // Setting currentTime during normal playback causes decoder pauses & micro-stuttering ("អាក់ៗ").
    if (Math.abs(activeDubAudio.currentTime - timeOffset) > 1.2) {
      try {
        activeDubAudio.currentTime = timeOffset;
      } catch (_) {}
    }
    return;
  }

  // Switch to new subtitle or start playing fresh
  stopDubVoicePlayback();

  try {
    const audio = new Audio(audioUrl);
    // Audio file on disk is already tempo-adjusted by FFmpeg
    audio.playbackRate = 1.0;
    audio.volume = state.dubVolume !== undefined ? state.dubVolume : 1.0;

    if (timeOffset > 0.05) {
      audio.currentTime = timeOffset;
    }

    activeDubAudio = audio;
    activeDubSubId = currentSub.id;
    applyVideoAudioDucking();

    audio.play().catch(err => {
      console.warn('Dub voice audio play blocked or pending:', err.message);
    });

    audio.onended = () => {
      if (activeDubSubId === currentSub.id) {
        activeDubAudio = null;
        activeDubSubId = null;
        // Keep video ducked/muted until currentTime exits [startSec - PAD_BEFORE -> endSec + PAD_AFTER]
        // This prevents hearing any trailing original speech if AI finished slightly earlier.
      }
    };
  } catch (err) {
    console.error('Failed to initialize dub audio:', err);
  }
}

// Expose on window for global coordination
window.syncDubVoicePlayback = syncDubVoicePlayback;
window.stopDubVoicePlayback = stopDubVoicePlayback;
window.pauseDubVoicePlayback = pauseDubVoicePlayback;
window.applyVideoAudioDucking = applyVideoAudioDucking;
window.restoreVideoAudioDucking = restoreVideoAudioDucking;
