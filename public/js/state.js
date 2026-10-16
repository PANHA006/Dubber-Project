/**
 * Central State Management for DAI Dubber Pro
 */
export const DEFAULT_DUBBING_SETTINGS = {
  endPadding: 0.70,       // 0.0 - 1.5s
  maxMergeLimit: 3,       // 1 - 10 segments
  maxPauseGap: 0.20,      // 0.05 - 0.50s
  vadThreshold: 0.10,     // 0.10, 0.25, 0.35, 0.50
  bgVolume: 8,            // 0 - 30%
  removeSpokenVoice: true // boolean
};

export function loadDubbingSettings() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('dubbing_settings');
      if (saved) {
        return { ...DEFAULT_DUBBING_SETTINGS, ...JSON.parse(saved) };
      }
    }
  } catch (e) {
    console.warn('Failed to load dubbing_settings from localStorage:', e);
  }
  return { ...DEFAULT_DUBBING_SETTINGS };
}

export function saveDubbingSettings(settings) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dubbing_settings', JSON.stringify(settings));
    }
  } catch (e) {
    console.warn('Failed to save dubbing_settings to localStorage:', e);
  }
}

export const state = {
  currentTime: 0.0, // in seconds (initially 0)
  duration: 0.0,    // in seconds (0 until video is loaded)
  isPlaying: false,
  isMuted: false,
  isIsolated: false,
  videoVolume: typeof localStorage !== 'undefined' && localStorage.getItem('video_preview_volume') !== null
    ? parseFloat(localStorage.getItem('video_preview_volume'))
    : 1.0,
  dubVolume: 1.0,
  zoomLevel: 1.0,   // 1.0 = normal (e.g. 25px per second)
  pxPerSec: 25,     // base timeline width in pixels per second
  activeLanguage: 'km',
  currentVideoFile: null,
  videoUrl: null,
  videoName: '',
  dubbedVideoUrl: null,
  previewMode: 'before',
  isUploadingVideo: false,
  isGeneratingVideo: false,
  isTranscribing: false,
  isTranslating: false,
  // Source language detected by the STT engine ('zh' | 'en' | ...). Drives the
  // translate router: a Chinese source takes the direct 1-quota path.
  sourceLanguage: null,
  geminiApiKey: typeof localStorage !== 'undefined' ? (localStorage.getItem('gemini_api_key') || '') : '',
  groqApiKey: typeof localStorage !== 'undefined' ? (localStorage.getItem('groq_api_key') || '') : '',
  serverHasGroqKey: false,
  sttModel: typeof localStorage !== 'undefined' ? (localStorage.getItem('selected_stt_model') || 'groq-whisper-large-v3') : 'groq-whisper-large-v3',
  
  // Dubbing Settings
  dubbingSettings: loadDubbingSettings(),

  // Subtitle list (Initially empty until user transcribes or imports)
  subtitles: [],
  isRestoringProject: false,
  rvcModels: [],

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
