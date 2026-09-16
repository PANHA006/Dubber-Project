/**
 * Timeline Module: Pixel-based Zoom, Dynamic Ruler, Tracks T1/A1, Interactive Scrubbing
 */
import { state } from './state.js';

export function initTimeline() {
  renderTimelineRuler();
  renderTimelineTracks();
  setupTimelineInteractions();

  state.on('subtitlesChanged', () => {
    renderTimelineTracks();
  });

  state.on('timeUpdated', (time) => {
    updatePlayheadPosition(time);
  });

  state.on('durationChanged', () => {
    renderTimelineRuler();
    renderTimelineTracks();
    updatePlayheadPosition(state.currentTime);
  });
}

/**
 * Calculate current pixel width per second based on zoomLevel
 */
export function getPixelsPerSecond() {
  return state.pxPerSec * state.zoomLevel;
}

/**
 * Render dynamic time ruler marks
 */
export function renderTimelineRuler() {
  const ruler = document.getElementById('timeline-ruler');
  if (!ruler) return;

  const pxPerSec = getPixelsPerSecond();
  const totalWidth = Math.max(state.duration * pxPerSec, 600);
  ruler.style.width = `${totalWidth}px`;
  ruler.innerHTML = '';

  // Determine interval based on zoom (e.g. 5s or 1s)
  const stepSec = pxPerSec >= 50 ? 2 : (pxPerSec >= 25 ? 5 : 10);

  for (let sec = 0; sec <= Math.ceil(state.duration); sec += stepSec) {
    const mark = document.createElement('div');
    mark.className = 'absolute top-0 bottom-0 border-l border-slate-800 text-[10px] font-mono text-slate-500 pl-1 select-none pointer-events-none';
    mark.style.left = `${sec * pxPerSec}px`;
    
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    mark.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    ruler.appendChild(mark);
  }
}

/**
 * Render T1 (Text Subtitles) and A1 (Audio Dub) tracks
 */
export function renderTimelineTracks() {
  const tracksWrapper = document.getElementById('tracks-wrapper');
  const trackT1 = document.getElementById('track-t1');
  const trackA1 = document.getElementById('track-a1');
  if (!trackT1 || !trackA1 || !tracksWrapper) return;

  const pxPerSec = getPixelsPerSecond();
  const totalWidth = Math.max(state.duration * pxPerSec, 600);

  tracksWrapper.style.width = `${totalWidth}px`;
  trackT1.innerHTML = '';
  trackA1.innerHTML = '';

  state.subtitles.forEach((sub) => {
    const leftPx = sub.startSec * pxPerSec;
    const widthPx = Math.max(24, (sub.endSec - sub.startSec) * pxPerSec);

    // Track T1 block (Subtitles)
    const tBlock = document.createElement('div');
    tBlock.className = `absolute h-7 rounded-md flex items-center px-2 text-[11px] font-khmer truncate cursor-pointer transition shadow-sm select-none ${
      sub.selected
        ? 'bg-indigo-600/90 text-white border border-indigo-300 ring-1 ring-indigo-400'
        : 'bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-900/80'
    }`;
    tBlock.style.left = `${leftPx}px`;
    tBlock.style.width = `${widthPx}px`;
    tBlock.title = `${sub.start} - ${sub.end}: ${sub.khmerText}`;
    tBlock.textContent = sub.khmerText;

    tBlock.onclick = (e) => {
      e.stopPropagation();
      window.seekTo?.(sub.startSec);
      state.subtitles.forEach(s => s.selected = (s.id === sub.id));
      state.emit('subtitlesChanged', state.subtitles);
      // Highlight in table
      const row = document.querySelector(`tr[data-id="${sub.id}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    trackT1.appendChild(tBlock);

    // Track A1 block (Audio Dub Waveform)
    const aBlock = document.createElement('div');
    aBlock.className = `absolute h-7 rounded-md flex items-center px-2 text-[10px] text-violet-200 overflow-hidden cursor-pointer ${
      sub.status === 'Ready'
        ? 'bg-violet-950/70 border border-violet-500/50'
        : 'bg-slate-900/60 border border-slate-700/40 opacity-50'
    }`;
    aBlock.style.left = `${leftPx}px`;
    aBlock.style.width = `${widthPx}px`;
    aBlock.title = `Audio [${sub.voice}] - ${sub.status}`;

    // SVG / CSS Simulated Waveform Bars
    aBlock.innerHTML = `
      <div class="flex items-center gap-0.5 w-full opacity-80 pointer-events-none">
        <span class="h-2.5 w-1 bg-violet-400 rounded-full"></span>
        <span class="h-4 w-1 bg-violet-300 rounded-full"></span>
        <span class="h-2 w-1 bg-violet-400 rounded-full"></span>
        <span class="h-5 w-1 bg-violet-300 rounded-full"></span>
        <span class="h-3 w-1 bg-violet-400 rounded-full"></span>
        <span class="h-4.5 w-1 bg-violet-300 rounded-full"></span>
        <span class="h-2 w-1 bg-violet-400 rounded-full"></span>
      </div>
    `;
    trackA1.appendChild(aBlock);
  });

  updatePlayheadPosition(state.currentTime);
}

/**
 * Move playhead needle precisely according to seconds
 */
export function updatePlayheadPosition(sec) {
  const playhead = document.getElementById('playhead');
  if (!playhead) return;

  const pxPerSec = getPixelsPerSecond();
  const leftPx = sec * pxPerSec;
  playhead.style.left = `${leftPx}px`;
}

/**
 * Set Zoom level (e.g. 0.8x to 3.0x) and re-render without distortion
 */
export function setTimelineZoom(zoom) {
  state.zoomLevel = parseFloat(zoom) || 1.0;
  renderTimelineRuler();
  renderTimelineTracks();
}

/**
 * Setup Click & Drag seeking on the timeline
 */
function setupTimelineInteractions() {
  const container = document.getElementById('timeline-scroll-container');
  const tracksWrapper = document.getElementById('tracks-wrapper');
  const ruler = document.getElementById('timeline-ruler');
  if (!container || !tracksWrapper) return;

  let isDragging = false;

  function handleSeek(e) {
    const rect = tracksWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pxPerSec = getPixelsPerSecond();
    const seconds = Math.max(0, Math.min(state.duration, clickX / pxPerSec));
    window.seekTo?.(seconds);
  }

  tracksWrapper.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleSeek(e);
  });

  ruler?.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleSeek(e);
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
