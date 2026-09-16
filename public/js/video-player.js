/**
 * Video Player Module: HTML5 Video handling, Canvas Visualizer fallback,
 * Overlay Sync, and Video Tools (Flip, Rotate, Aspect Ratio, Audio Mute)
 */
import { state } from './state.js';
import { logToTerminal } from './logger.js';

let animationFrameId = null;
let lastTimestamp = null;
let isFlipped = false;
let currentRotation = 0;
let subColorIndex = 0;

const subColorStyles = [
  'bg-black/75 text-white border-white/10',
  'bg-indigo-950/90 text-indigo-100 border-indigo-500/30',
  'bg-amber-950/90 text-amber-200 border-amber-500/30'
];

export function formatTimecodeDisplay(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function initVideoPlayer() {
  const mainVideo = document.getElementById('main-video');
  const videoInput = document.getElementById('video-file-input');
  const previewCanvas = document.getElementById('preview-canvas');
  const playerViewport = document.getElementById('player-viewport');

  // 1. Click on player screen to toggle Play/Pause
  if (playerViewport) {
    playerViewport.style.cursor = 'pointer';
    playerViewport.addEventListener('click', (e) => {
      // Don't toggle if clicking on specific buttons/tools
      if (e.target.closest('button') || e.target.closest('input')) return;
      togglePlay();
    });
  }

  // 2. Video input change (Load Video)
  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      state.currentVideoFile = file;
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

      // Update Transcript button status
      const btnTranscribe = document.getElementById('btn-transcribe');
      if (btnTranscribe) {
        btnTranscribe.removeAttribute('disabled');
        btnTranscribe.classList.remove('opacity-50', 'cursor-not-allowed');
      }

      mainVideo.onloadedmetadata = () => {
        state.duration = mainVideo.duration || 30.0;
        document.getElementById('timecode-total').textContent = formatTimecodeDisplay(state.duration);
        document.getElementById('video-resolution').textContent = `${mainVideo.videoWidth}x${mainVideo.videoHeight}`;
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
      state.emit('timeUpdated', state.currentTime);
    });

    // Sync play state icon when native video starts playing
    mainVideo.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayButtonUI(true);
    });

    // Sync pause state icon when native video pauses
    mainVideo.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayButtonUI(false);
    });

    // When video ends
    mainVideo.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayButtonUI(false);
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
        window.showToast?.('កំពុងចាក់ Playback');
      }).catch((err) => {
        console.warn('Autoplay restriction or play error:', err);
        // Fallback: If blocked due to audio, mute and play
        mainVideo.muted = true;
        mainVideo.play().then(() => {
          state.isPlaying = true;
          updatePlayButtonUI(true);
          window.showToast?.('កំពុងចាក់ Playback (Muted)');
        }).catch((e) => {
          window.showToast?.('មិនអាចចាក់វីដេអូបានទេ៖ ' + e.message);
        });
      });
    } else {
      mainVideo.pause();
      state.isPlaying = false;
      updatePlayButtonUI(false);
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
    window.showToast?.('កំពុងចាក់ Demo Playback');
  } else {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
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

// Tool functions
export function flipVideo() {
  isFlipped = !isFlipped;
  const mainVideo = document.getElementById('main-video');
  const previewCanvas = document.getElementById('preview-canvas');
  const transform = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
  if (mainVideo) mainVideo.style.transform = transform;
  if (previewCanvas) previewCanvas.style.transform = transform;
  window.showToast?.(isFlipped ? 'បាន Flip ផ្ដេក' : 'វីដេអូសភាពដើម');
}

export function rotateVideo() {
  currentRotation = (currentRotation + 90) % 360;
  const mainVideo = document.getElementById('main-video');
  if (mainVideo) mainVideo.style.transform = `rotate(${currentRotation}deg)`;
  window.showToast?.(`បានបង្វិលទៅ ${currentRotation}°`);
}

export function toggleVideoAspect() {
  const viewport = document.getElementById('player-viewport');
  if (!viewport) return;
  viewport.classList.toggle('max-w-[280px]');
  window.showToast?.('បានផ្លាស់ប្តូរ Aspect Ratio 16:9 / 9:16');
}

export function toggleSubOverlay() {
  const overlay = document.getElementById('sub-overlay-container');
  if (overlay) {
    overlay.classList.toggle('hidden');
    window.showToast?.('បានប្តូរការបង្ហាញ Subtitle Overlay');
  }
}

export function cycleSubColor() {
  subColorIndex = (subColorIndex + 1) % subColorStyles.length;
  const subText = document.getElementById('sub-overlay-text');
  if (subText) {
    subText.className = `px-3.5 py-1.5 ${subColorStyles[subColorIndex]} backdrop-blur-md rounded-lg font-khmer text-sm md:text-base tracking-wide border shadow-2xl text-center max-w-[90%] transition-all`;
    window.showToast?.('បានផ្លាស់ប្តូរស្ទាយ Subtitle');
  }
}

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
