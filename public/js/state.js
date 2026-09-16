/**
 * Central State Management for DAI Dubber Pro
 */
export const state = {
  currentTime: 2.0, // in seconds
  duration: 30.0,   // default or loaded video duration
  isPlaying: false,
  isMuted: false,
  isIsolated: false,
  autoFit: false,
  zoomLevel: 1.0,   // 1.0 = normal (e.g. 25px per second)
  pxPerSec: 25,     // base timeline width in pixels per second
  activeLanguage: 'km',
  activeTab: 'video_01.mp4',
  currentVideoFile: null,
  isTranscribing: false,
  geminiApiKey: typeof localStorage !== 'undefined' ? (localStorage.getItem('gemini_api_key') || '') : '',
  
  // Subtitle list (Initially empty until user transcribes or imports)
  subtitles: [],

  // Listeners for state change notifications
  listeners: {},

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
};
