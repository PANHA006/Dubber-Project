/**
 * System Updates & Dependencies Management Module
 * Handles checking and updating FFmpeg, Python .venv packages (edge-tts, faster-whisper, etc.)
 */
import { logToTerminal } from './logger.js';

let isUpdating = false;
let bannerTimeout = null;

export function showUpdateBanner(state, title, message, badge = '') {
  const banner = document.getElementById('system-update-progress-banner');
  const bannerIconBox = document.getElementById('system-update-banner-icon-box');
  const bannerIcon = document.getElementById('system-update-banner-icon');
  const titleElem = document.getElementById('system-update-status-title');
  const badgeElem = document.getElementById('system-update-status-badge');
  const textElem = document.getElementById('system-update-status-text');
  const percentElem = document.getElementById('system-update-progress-percent');
  const fillElem = document.getElementById('system-update-progress-fill');

  if (!banner) return;
  if (bannerTimeout) {
    clearTimeout(bannerTimeout);
    bannerTimeout = null;
  }

  banner.classList.remove('hidden');

  if (state === 'updating') {
    banner.className = 'shrink-0 rounded-xl bg-gradient-to-r from-cyan-950/70 via-slate-900/90 to-indigo-950/70 border border-cyan-500/40 p-3 shadow-lg shadow-cyan-950/40 transition-all duration-300';
    if (bannerIconBox) bannerIconBox.className = 'p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0';
    if (bannerIcon) {
      bannerIcon.setAttribute('data-lucide', 'refresh-cw');
      bannerIcon.className = 'w-4 h-4 animate-spin text-cyan-300';
    }
    if (titleElem) titleElem.textContent = title || 'កំពុងដំណើរការអាប់ដេត...';
    if (badgeElem) {
      badgeElem.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 whitespace-nowrap';
      badgeElem.textContent = badge || 'In Progress';
    }
    if (textElem) textElem.textContent = message || 'កំពុងទាញយក និងដំឡើងកញ្ចប់ពី Official PyPI...';
    if (percentElem) {
      percentElem.className = 'text-xs font-mono font-bold text-cyan-300';
      percentElem.textContent = 'Updating...';
    }
    if (fillElem) {
      fillElem.className = 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-cyan-300 h-full rounded-full transition-all duration-500 animate-pulse w-full';
    }
  } else if (state === 'success') {
    banner.className = 'shrink-0 rounded-xl bg-gradient-to-r from-emerald-950/70 via-slate-900/90 to-slate-900/80 border border-emerald-500/50 p-3 shadow-lg shadow-emerald-950/40 transition-all duration-300';
    if (bannerIconBox) bannerIconBox.className = 'p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0';
    if (bannerIcon) {
      bannerIcon.setAttribute('data-lucide', 'check-circle-2');
      bannerIcon.className = 'w-4 h-4 text-emerald-300';
    }
    if (titleElem) titleElem.textContent = title || 'អាប់ដេតបានជោគជ័យ!';
    if (badgeElem) {
      badgeElem.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap';
      badgeElem.textContent = badge || 'Completed';
    }
    if (textElem) textElem.textContent = message || 'កញ្ចប់ទាំងអស់ត្រូវបានអាប់ដេតរួចរាល់។';
    if (percentElem) {
      percentElem.className = 'text-xs font-mono font-bold text-emerald-400';
      percentElem.textContent = '100%';
    }
    if (fillElem) {
      fillElem.className = 'bg-emerald-500 h-full rounded-full transition-all duration-500 w-full';
    }

    bannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 4500);
  } else if (state === 'error') {
    banner.className = 'shrink-0 rounded-xl bg-gradient-to-r from-red-950/70 via-slate-900/90 to-slate-900/80 border border-red-500/50 p-3 shadow-lg shadow-red-950/40 transition-all duration-300';
    if (bannerIconBox) bannerIconBox.className = 'p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 shrink-0';
    if (bannerIcon) {
      bannerIcon.setAttribute('data-lucide', 'alert-circle');
      bannerIcon.className = 'w-4 h-4 text-red-400';
    }
    if (titleElem) titleElem.textContent = title || 'ការអាប់ដេតជួបបញ្ហា';
    if (badgeElem) {
      badgeElem.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/30 whitespace-nowrap';
      badgeElem.textContent = badge || 'Failed';
    }
    if (textElem) textElem.textContent = message || 'មិនអាចអាប់ដេតកញ្ចប់បានទេ សូមព្យាយាមម្តងទៀត។';
    if (percentElem) {
      percentElem.className = 'text-xs font-mono font-bold text-red-400';
      percentElem.textContent = 'Error';
    }
    if (fillElem) {
      fillElem.className = 'bg-red-500 h-full rounded-full transition-all duration-500 w-full';
    }

    bannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 6000);
  }

  window.lucide?.createIcons();
}

export async function openSystemUpdatesModal() {
  const modal = document.getElementById('system-updates-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  window.lucide?.createIcons();

  await loadSystemDependencies(false);
}

export function closeSystemUpdatesModal() {
  const modal = document.getElementById('system-updates-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export async function loadSystemDependencies(force = false) {
  const container = document.getElementById('dependencies-list-container');
  const ffmpegVerElem = document.getElementById('ffmpeg-current-version');
  const pythonVerElem = document.getElementById('python-current-version');
  const refreshBtn = document.getElementById('btn-refresh-dependencies');
  const indicator = document.getElementById('system-update-indicator');

  if (refreshBtn) {
    refreshBtn.classList.add('animate-spin');
  }

  try {
    const res = await fetch(`/api/system/dependencies${force ? '?force=true' : ''}`);
    const json = await res.json();

    if (res.ok && json.success && json.data) {
      const data = json.data;

      // Update FFmpeg & Python headers
      if (ffmpegVerElem) {
        ffmpegVerElem.textContent = data.ffmpeg?.currentVersion || '9.0.1';
      }
      if (pythonVerElem) {
        pythonVerElem.textContent = data.python?.currentVersion ? `Python ${data.python.currentVersion}` : 'Python 3.14';
      }

      // Update Navbar indicator dot
      if (indicator) {
        if (data.hasAnyUpdate) {
          indicator.classList.remove('hidden', 'bg-emerald-400');
          indicator.classList.add('bg-amber-400', 'animate-pulse');
          indicator.title = 'មាន Update ថ្មីសម្រាប់កញ្ចប់ AI';
        } else {
          indicator.classList.remove('hidden', 'bg-amber-400', 'animate-pulse');
          indicator.classList.add('bg-emerald-400');
          indicator.title = 'ឧបករណ៍ទាំងអស់ទាន់សម័យ (Up to date)';
        }
      }

      // Render Python Packages List
      renderPackagesList(data.packages || []);
    } else {
      console.warn('Failed to load dependencies status:', json);
      if (container) {
        container.innerHTML = `<div class="p-4 text-center text-amber-400 text-xs">មិនអាចទាញយកព័ត៌មានឧបករណ៍បានទេ (សូមពិនិត្យ Server)</div>`;
      }
    }
  } catch (err) {
    console.error('Dependencies fetch error:', err);
    if (container) {
      container.innerHTML = `<div class="p-4 text-center text-red-400 text-xs">កំហុសក្នុងការទាញយកព័ត៌មាន៖ ${err.message}</div>`;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('animate-spin');
    }
  }
}

function renderPackagesList(packages) {
  const container = document.getElementById('dependencies-list-container');
  if (!container) return;

  if (packages.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">មិនមានកញ្ចប់សម្រាប់បង្ហាញឡើយ</div>`;
    return;
  }

  container.innerHTML = packages.map(pkg => {
    const hasUpdate = pkg.hasUpdate;
    const isUpToDate = pkg.status === 'up-to-date';

    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border ${hasUpdate ? 'border-amber-500/40 bg-amber-950/10' : 'border-slate-800'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-slate-200 text-xs font-mono">${pkg.id}</span>
            <span class="text-[11px] text-slate-400">(${pkg.name})</span>
            ${
              hasUpdate
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Update Available</span>`
                : (isUpToDate
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Up to date</span>`
                    : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">Installed</span>`)
            }
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">${pkg.desc}</p>
          <div class="flex items-center gap-3 text-[10.5px] font-mono text-slate-400 pt-0.5">
            <span>Current: <strong class="text-slate-200">${pkg.currentVersion}</strong></span>
            <span>Latest: <strong class="${hasUpdate ? 'text-amber-300' : 'text-slate-300'}">${pkg.latestVersion}</strong></span>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end">
          <button onclick="window.updateSpecificPackage('${pkg.id}')"
            ${isUpdating ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs ${
              hasUpdate
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border border-amber-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 hover:text-white'
            }">
            <i data-lucide="${hasUpdate ? 'arrow-up-circle' : 'refresh-cw'}" class="w-3.5 h-3.5"></i>
            <span>${hasUpdate ? 'Update Now' : 'Reinstall'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  window.lucide?.createIcons();
}

export async function updateSpecificPackage(packageName) {
  if (isUpdating) return;
  isUpdating = true;
  setUpdatingUI(true, `កំពុងអាប់ដេតកញ្ចប់ ${packageName} តាម Official PyPI...`);

  try {
    logToTerminal('CLIENT:UPDATE_PKG', `Requesting pip upgrade for: ${packageName}...`);
    window.showToast?.(`⏳ កំពុងដំណើរការ Update ${packageName}...`);

    const res = await fetch('/api/system/update-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      window.showToast?.(`🎉 បានអាប់ដេត ${packageName} ទៅកាន់ជំនាន់ ${result.newVersion || 'ថ្មី'} ជោគជ័យ!`);
      logToTerminal('CLIENT:UPDATE_OK', `Successfully updated ${packageName} to ${result.newVersion}`);
      showUpdateBanner('success', 'អាប់ដេតបានជោគជ័យ!', `បានអាប់ដេត ${packageName} ទៅកាន់ជំនាន់ ${result.newVersion || 'ថ្មី'} ដោយជោគជ័យ។`, 'Done');
      await loadSystemDependencies(true);
    } else {
      throw new Error(result.message || 'Update failed');
    }
  } catch (err) {
    console.error('Package update failed:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការអាប់ដេត ${packageName}៖ ${err.message}`);
    logToTerminal('CLIENT:UPDATE_ERR', `Failed to update ${packageName}: ${err.message}`);
    showUpdateBanner('error', 'ការអាប់ដេតបរាជ័យ', `បរាជ័យក្នុងការអាប់ដេត ${packageName}៖ ${err.message}`, 'Failed');
  } finally {
    isUpdating = false;
    setUpdatingUI(false);
  }
}

export async function updateAllAiEngines() {
  if (isUpdating) return;
  isUpdating = true;
  setUpdatingUI(true, 'កំពុងអាប់ដេតកញ្ចប់ AI ទាំងអស់ (edge-tts, faster-whisper, ctranslate2)...');

  try {
    logToTerminal('CLIENT:UPDATE_ALL', 'Requesting 1-Click upgrade for all AI engines...');
    window.showToast?.('⚡ កំពុងដំណើរការអាប់ដេតកញ្ចប់ AI ទាំងអស់...');

    const res = await fetch('/api/system/update-all-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();

    if (res.ok && result.success) {
      window.showToast?.('🎉 បានអាប់ដេតកញ្ចប់ AI ទាំងអស់ជោគជ័យ!');
      logToTerminal('CLIENT:UPDATE_ALL_OK', 'All AI engines upgraded successfully!');
      showUpdateBanner('success', 'អាប់ដេតកញ្ចប់ AI ជោគជ័យ!', 'កញ្ចប់ AI ទាំងអស់ត្រូវបានអាប់ដេតទៅកាន់ជំនាន់ថ្មីចុងក្រោយបង្អស់។', 'All Updated');
      await loadSystemDependencies(true);
    } else {
      throw new Error(result.message || 'Batch update encountered an issue');
    }
  } catch (err) {
    console.error('All AI engines update failed:', err);
    window.showToast?.(`❌ បរាជ័យក្នុងការអាប់ដេតកញ្ចប់ AI៖ ${err.message}`);
    logToTerminal('CLIENT:UPDATE_ALL_ERR', `Error updating AI engines: ${err.message}`);
    showUpdateBanner('error', 'ការអាប់ដេតបរាជ័យ', `កំហុសក្នុងការអាប់ដេតកញ្ចប់ AI៖ ${err.message}`, 'Failed');
  } finally {
    isUpdating = false;
    setUpdatingUI(false);
  }
}

function setUpdatingUI(busy, label = '') {
  const btnAll = document.getElementById('btn-update-all-ai');
  const actionBtns = document.querySelectorAll('#dependencies-list-container button');

  if (busy) {
    if (btnAll) {
      btnAll.setAttribute('disabled', 'true');
      btnAll.classList.add('opacity-60', 'cursor-wait');
    }
    actionBtns.forEach(btn => {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('opacity-50', 'pointer-events-none');
    });
    showUpdateBanner('updating', 'កំពុងដំណើរការអាប់ដេត...', label || 'កំពុងដំឡើងកញ្ចប់ពី PyPI...', 'Updating');
  } else {
    if (btnAll) {
      btnAll.removeAttribute('disabled');
      btnAll.classList.remove('opacity-60', 'cursor-wait');
    }
    actionBtns.forEach(btn => {
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-50', 'pointer-events-none');
    });
  }
}

// Global window exposure
window.openSystemUpdatesModal = openSystemUpdatesModal;
window.closeSystemUpdatesModal = closeSystemUpdatesModal;
window.loadSystemDependencies = loadSystemDependencies;
window.updateSpecificPackage = updateSpecificPackage;
window.updateAllAiEngines = updateAllAiEngines;
window.showUpdateBanner = showUpdateBanner;
