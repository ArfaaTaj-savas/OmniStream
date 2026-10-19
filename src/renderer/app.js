// ==========================================================================
// Universal Video Downloader Pro - Renderer Application Logic
// ==========================================================================

// Check environment: native desktop or web browser showcase
if (typeof window.downloader === 'undefined') {
  window.isWebDemo = true;
  let progressCb = null;
  let finishedCb = null;
  let activeTimer = null;

  window.downloader = {
    chooseFolder: async () => 'Downloads (Desktop Mode Required)',
    chooseFile: async () => 'cookies.txt',
    getDefaultFolder: async () => 'Downloads (Browser Demo)',
    openFolder: async () => showToast('Desktop feature: opens folder in Windows Explorer', 'info'),
    showItemInFolder: async () => showToast('Desktop feature: reveals file in Windows Explorer', 'info'),
    readClipboard: async () => '',
    checkEngine: async () => ({ ok: true, version: '2026.08.19 (Web Demo)' }),
    inspectUrl: async ({ url }) => {
      const trimmedUrl = (url || '').trim();

      // 1. YouTube & YouTube Shorts / Music
      const ytMatch = trimmedUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
      if (ytMatch) {
        const videoId = ytMatch[1];
        let title = `YouTube Video [${videoId}]`;
        let uploader = 'YouTube Creator';
        let thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (oembedRes.ok) {
            const odata = await oembedRes.json();
            if (odata.title) title = odata.title;
            if (odata.author_name) uploader = odata.author_name;
          }
        } catch (e) {
          console.warn('YouTube oEmbed inspection fallback:', e);
        }

        return {
          ok: true,
          info: {
            id: videoId,
            title,
            uploader,
            duration: 1324,
            thumbnail,
            fallbackThumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
            extractor: 'youtube',
            formats: [
              { id: '1080p', resolution: '1080p FHD', ext: 'mp4', filesize: 145000000, height: 1080 },
              { id: '720p', resolution: '720p HD', ext: 'mp4', filesize: 75000000, height: 720 },
              { id: '480p', resolution: '480p SD', ext: 'mp4', filesize: 38000000, height: 480 },
              { id: '360p', resolution: '360p Mobile', ext: 'mp4', filesize: 18000000, height: 360 },
              { id: 'audio-mp3', resolution: 'Audio MP3', ext: 'mp3', abr: 320, filesize: 12000000 }
            ]
          }
        };
      }

      // 2. Vimeo
      const vimeoMatch = trimmedUrl.match(/vimeo\.com\/(\d+)/i);
      if (vimeoMatch) {
        const vId = vimeoMatch[1];
        let title = `Vimeo Video (${vId})`;
        let uploader = 'Vimeo Creator';
        let thumbnail = 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=640&q=80';
        let duration = 210;
        try {
          const vres = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmedUrl)}`);
          if (vres.ok) {
            const vdata = await vres.json();
            if (vdata.title) title = vdata.title;
            if (vdata.author_name) uploader = vdata.author_name;
            if (vdata.thumbnail_url) thumbnail = vdata.thumbnail_url;
            if (vdata.duration) duration = vdata.duration;
          }
        } catch (e) {}

        return {
          ok: true,
          info: {
            id: vId,
            title,
            uploader,
            duration,
            thumbnail,
            webpage_url: trimmedUrl,
            extractor: 'vimeo',
            formats: [
              { id: '1080p', resolution: '1080p FHD', ext: 'mp4', filesize: 110000000, height: 1080 },
              { id: '720p', resolution: '720p HD', ext: 'mp4', filesize: 55000000, height: 720 }
            ]
          }
        };
      }

      // 3. Generic web URLs
      let host = 'Web Media';
      try {
        host = new URL(trimmedUrl).hostname.replace(/^www\./, '');
      } catch (e) {}

      return {
        ok: true,
        info: {
          id: 'web_stream',
          title: `${host.charAt(0).toUpperCase() + host.slice(1)} Stream`,
          uploader: host,
          duration: 180,
          thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=640&q=80',
          webpage_url: trimmedUrl,
          extractor: host.split('.')[0] || 'generic',
          formats: [
            { id: 'best', resolution: 'Best Available', ext: 'mp4', filesize: 52000000, height: 1080 },
            { id: 'audio', resolution: 'Audio MP3', ext: 'mp3', abr: 320, filesize: 6000000 }
          ]
        }
      };
    },
    startDownload: async () => {
      let pct = 0;
      clearInterval(activeTimer);
      activeTimer = setInterval(() => {
        pct += 20;
        if (progressCb) {
          progressCb({ percent: Math.min(pct, 99), speed: '24.6 MB/s', eta: '00:02' });
        }
        if (pct >= 100) {
          clearInterval(activeTimer);
          if (finishedCb) {
            finishedCb({ ok: true, filePath: 'OmniStream_Downloaded_Video.mp4' });
          }
        }
      }, 350);
      return { ok: true };
    },
    pauseDownload: async () => { clearInterval(activeTimer); return { ok: true }; },
    cancelDownload: async () => { clearInterval(activeTimer); return { ok: true }; },
    onProgress: cb => { progressCb = cb; },
    onFinished: cb => { finishedCb = cb; },
    onLog: () => {},
    onRawLog: () => {}
  };
}

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

// App State
const state = {
  currentUrl: '',
  info: null,
  output: localStorage.getItem('uvdp-output') || '',
  selectedPreset: 'video-1080',
  customFormatId: 'bv*+ba/b',
  downloading: false,
  paused: false,
  activeMode: 'single', // 'single' | 'batch'
  history: JSON.parse(localStorage.getItem('uvdp-history') || '[]'),
  options: JSON.parse(localStorage.getItem('uvdp-options') || '{"proxy":"","cookies":""}'),
  batchQueue: [],
  batchIndex: 0,
  batchRunning: false,
  resolveDownload: null
};

// UI Elements
const themeToggle = $('#themeToggle');
const tabSingle = $('#tabSingle');
const tabBatch = $('#tabBatch');
const singleView = $('#singleView');
const batchView = $('#batchView');
const urlInput = $('#urlInput');
const clearUrlBtn = $('#clearUrlBtn');
const pasteClipboardBtn = $('#pasteClipboardBtn');
const inspectButton = $('#inspectButton');
const inspectSpinner = $('#inspectSpinner');
const detectedPlatformBanner = $('#detectedPlatformBanner');
const platformDetectedLabel = $('#platformDetectedLabel');
const detectedStatusText = $('#detectedStatusText');
const previewCard = $('#previewCard');
const videoThumb = $('#videoThumb');
const videoDuration = $('#videoDuration');
const videoResolutionBadge = $('#videoResolutionBadge');
const videoTitle = $('#videoTitle');
const videoUploader = $('#videoUploader');
const videoExtractor = $('#videoExtractor');
const presetChips = $$('.preset-chip');
const customFormatWrapper = $('#customFormatWrapper');
const formatSelect = $('#formatSelect');
const outputDisplay = $('#outputDisplay');
const folderButton = $('#folderButton');
const openFolderBtn = $('#openFolderBtn');
const embedThumbnailCheck = $('#embedThumbnailCheck');
const embedSubsCheck = $('#embedSubsCheck');
const downloadButton = $('#downloadButton');
const downloadBtnText = $('#downloadBtnText');

// HUD Elements
const transferHud = $('#transferHud');
const progressTitle = $('#progressTitle');
const progressPercent = $('#progressPercent');
const progressDetail = $('#progressDetail');
const progressBar = $('#progressBar');
const speedText = $('#speedText');
const etaText = $('#etaText');
const pauseButton = $('#pauseButton');
const cancelButton = $('#cancelButton');
const revealCompletedBtn = $('#revealCompletedBtn');
let lastDownloadedFile = null;

// Batch Elements
const batchInput = $('#batchInput');
const batchBadge = $('#batchBadge');
const batchTabCount = $('#batchTabCount');
const batchAudioOnly = $('#batchAudioOnly');
const clearBatchBtn = $('#clearBatchBtn');
const startBatchBtn = $('#startBatchBtn');
const queueList = $('#queueList');
const queueProgressCount = $('#queueProgressCount');

// History Elements
const historyList = $('#historyList');
const clearHistory = $('#clearHistory');

// Terminal Drawer Elements
const toggleTerminalBtn = $('#toggleTerminalBtn');
const terminalDrawer = $('#terminalDrawer');
const closeTerminalBtn = $('#closeTerminalBtn');
const clearLogBtn = $('#clearLogBtn');
const copyLogBtn = $('#copyLogBtn');
const terminalBody = $('#terminalBody');
const logActivityDot = $('#logActivityDot');

// Settings Modal Elements
const openSettingsBtn = $('#openSettingsBtn');
const settingsModal = $('#settingsModal');
const closeSettingsBtn = $('#closeSettingsBtn');
const saveSettingsBtn = $('#saveSettingsBtn');
const proxyInput = $('#proxyInput');
const browserCookieSelect = $('#browserCookieSelect');
const cookiesInput = $('#cookiesInput');
const browseCookiesBtn = $('#browseCookiesBtn');
const modalEngineVer = $('#modalEngineVer');
const engineVersionLabel = $('#engineVersionLabel');

// ==========================================================================
// Theme & Settings Initialization
// ==========================================================================

function initTheme() {
  const savedTheme = localStorage.getItem('uvdp-theme') || 'dark';
  document.documentElement.dataset.theme = savedTheme;
  themeToggle.querySelector('.theme-icon').textContent = savedTheme === 'dark' ? '☀' : '☾';
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('uvdp-theme', next);
  themeToggle.querySelector('.theme-icon').textContent = next === 'dark' ? '☀' : '☾';
});

async function initEngineAndPaths() {
  // Check and display default output path
  if (!state.output) {
    try {
      const defaultFolder = await window.downloader.getDefaultFolder();
      if (defaultFolder) {
        state.output = defaultFolder;
        localStorage.setItem('uvdp-output', defaultFolder);
      }
    } catch (e) {
      console.warn('Could not read default folder:', e);
    }
  }
  updateOutputDisplay();

  // Load Proxy, Browser & Cookies
  proxyInput.value = state.options.proxy || '';
  cookiesInput.value = state.options.cookies || '';
  if (browserCookieSelect) {
    browserCookieSelect.value = state.options.browser || 'none';
  }

  // Check Engine version
  try {
    const res = await window.downloader.checkEngine();
    if (res.ok && res.version) {
      engineVersionLabel.textContent = `yt-dlp ${res.version}`;
      modalEngineVer.textContent = `yt-dlp v${res.version}`;
      appendLogLine(`[system] Verified engine: yt-dlp ${res.version} is active.`, 'system');
    } else {
      engineVersionLabel.textContent = 'yt-dlp (Python)';
      modalEngineVer.textContent = 'Available via py -m yt_dlp';
    }
  } catch (err) {
    engineVersionLabel.textContent = 'Engine Ready';
  }

  // Activate web showcase banner if running on web
  if (window.isWebDemo) {
    const banner = $('#webShowcaseBanner');
    if (banner) banner.classList.remove('hidden');
    engineVersionLabel.textContent = 'yt-dlp (Web Demo)';
    modalEngineVer.textContent = 'Web Showcase Mode';
  }
}

function updateOutputDisplay() {
  if (state.output) {
    outputDisplay.textContent = state.output;
    outputDisplay.title = state.output;
  } else {
    outputDisplay.textContent = 'Click to select folder...';
  }
}

// ==========================================================================
// Toast Notification Utility
// ==========================================================================

function showToast(message, type = 'info', duration = 4000) {
  const dock = $('#toastDock');
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${escapeHtml(message)}</span>`;

  dock.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ==========================================================================
// Platform Detection & Input Handling
// ==========================================================================

function detectPlatform(url) {
  const trimmed = (url || '').trim();
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return { name: 'YouTube', color: '#ff0000', label: 'YouTube Video / Short' };
  if (/tiktok\.com/i.test(trimmed)) return { name: 'TikTok', color: '#00f2fe', label: 'TikTok Video' };
  if (/instagram\.com/i.test(trimmed)) return { name: 'Instagram', color: '#e1306c', label: 'Instagram Reel / Post' };
  if (/twitter\.com|x\.com/i.test(trimmed)) return { name: 'X / Twitter', color: '#1da1f2', label: 'X (Twitter) Clip' };
  if (/vimeo\.com/i.test(trimmed)) return { name: 'Vimeo', color: '#1ab7ea', label: 'Vimeo Video' };
  if (/reddit\.com/i.test(trimmed)) return { name: 'Reddit', color: '#ff4500', label: 'Reddit Media' };
  if (/twitch\.tv/i.test(trimmed)) return { name: 'Twitch', color: '#9146ff', label: 'Twitch Clip / VOD' };
  if (/soundcloud\.com/i.test(trimmed)) return { name: 'SoundCloud', color: '#ff5500', label: 'SoundCloud Track' };
  if (/facebook\.com|fb\.watch/i.test(trimmed)) return { name: 'Facebook', color: '#1877f2', label: 'Facebook Video' };
  if (/^https?:\/\//i.test(trimmed)) return { name: 'Universal Web', color: '#8b5cf6', label: 'Direct Web Media' };
  return null;
}

function updateUrlInputState() {
  const val = urlInput.value.trim();
  clearUrlBtn.classList.toggle('hidden', val.length === 0);

  const platform = detectPlatform(val);
  if (platform) {
    detectedPlatformBanner.classList.remove('hidden');
    platformDetectedLabel.textContent = platform.name;
    platformDetectedLabel.style.color = platform.color;
    detectedStatusText.textContent = `${platform.label} detected · Ready to inspect`;
  } else {
    detectedPlatformBanner.classList.add('hidden');
  }
}

urlInput.addEventListener('input', updateUrlInputState);

clearUrlBtn.addEventListener('click', () => {
  urlInput.value = '';
  updateUrlInputState();
  previewCard.classList.add('hidden');
  urlInput.focus();
});

pasteClipboardBtn.addEventListener('click', async () => {
  try {
    let clipText = '';
    if (window.downloader?.readClipboard) {
      clipText = await window.downloader.readClipboard();
    } else {
      clipText = await navigator.clipboard.readText();
    }
    if (clipText && clipText.trim()) {
      urlInput.value = clipText.trim();
      updateUrlInputState();
      showToast('URL pasted from clipboard', 'info', 2000);
      handleInspect();
    } else {
      showToast('Clipboard is empty or does not contain text', 'error');
    }
  } catch (err) {
    showToast('Could not access clipboard', 'error');
  }
});

// ==========================================================================
// Video Metadata Inspection
// ==========================================================================

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function handleInspect() {
  const url = urlInput.value.trim();
  if (!url) {
    showToast('Please paste a valid video URL first.', 'error');
    urlInput.focus();
    return;
  }

  inspectButton.disabled = true;
  inspectSpinner.classList.remove('hidden');
  inspectButton.querySelector('.btn-text').textContent = 'Analyzing...';
  appendLogLine(`[inspect] Probing metadata for: ${url}`, 'info');

  try {
    const result = await window.downloader.inspectUrl({
      url,
      options: state.options
    });

    if (!result.ok) {
      showToast(result.error || 'Failed to inspect this media URL.', 'error', 6000);
      appendLogLine(`[error] Inspection failed: ${result.error}`, 'error');
      previewCard.classList.add('hidden');
      return;
    }

    state.info = result.info;
    renderPreviewCard(result.info);
    showToast('Media detected successfully!', 'success', 2500);
    appendLogLine(`[info] Stream resolved: "${result.info.title}" (${result.info.formats.length} streams available)`, 'download');

  } catch (err) {
    showToast('Unexpected error inspecting URL: ' + err.message, 'error');
    appendLogLine(`[error] Exception: ${err.message}`, 'error');
  } finally {
    inspectButton.disabled = false;
    inspectSpinner.classList.add('hidden');
    inspectButton.querySelector('.btn-text').textContent = 'Detect Media';
  }
}

inspectButton.addEventListener('click', handleInspect);

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (state.info && !previewCard.classList.contains('hidden')) {
      handleStartDownload();
    } else {
      handleInspect();
    }
  }
});

function renderPreviewCard(info) {
  videoTitle.textContent = info.title || 'Untitled Video';
  videoTitle.title = info.title;
  videoUploader.textContent = info.uploader || 'Creator';
  videoExtractor.textContent = info.extractor || 'yt-dlp';
  videoDuration.textContent = formatDuration(info.duration);

  // Set thumbnail with fallback
  if (info.thumbnail) {
    videoThumb.src = info.thumbnail;
    videoThumb.onerror = () => {
      if (info.fallbackThumbnail && videoThumb.src !== info.fallbackThumbnail) {
        videoThumb.src = info.fallbackThumbnail;
      } else {
        videoThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="16">Preview Thumbnail</text></svg>';
      }
    };
  } else {
    videoThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="16">Video Stream</text></svg>';
  }

  // Detect maximum resolution
  const heights = (info.formats || []).map(f => f.height).filter(Boolean);
  const maxH = heights.length ? Math.max(...heights) : 0;
  if (maxH >= 2160) {
    videoResolutionBadge.textContent = '4K UHD';
  } else if (maxH >= 1440) {
    videoResolutionBadge.textContent = '2K QHD';
  } else if (maxH >= 1080) {
    videoResolutionBadge.textContent = '1080p FHD';
  } else if (maxH >= 720) {
    videoResolutionBadge.textContent = '720p HD';
  } else {
    videoResolutionBadge.textContent = 'Auto HD';
  }

  // Populate Custom Format Dropdown
  formatSelect.innerHTML = '';
  const bestAutoOption = document.createElement('option');
  bestAutoOption.value = 'bv*+ba/b';
  bestAutoOption.textContent = 'Best Video + Audio (Automatic Merge MP4)';
  formatSelect.appendChild(bestAutoOption);

  const bestAudioOption = document.createElement('option');
  bestAudioOption.value = 'bestaudio/best';
  bestAudioOption.textContent = 'Best Audio Only (MP3/M4A 320k)';
  formatSelect.appendChild(bestAudioOption);

  (info.formats || []).slice(0, 75).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.ext.toUpperCase()} · ${f.resolution || (f.abr ? `${Math.round(f.abr)}kbps audio` : 'stream')} · ${f.filesize ? `${(f.filesize / 1048576).toFixed(1)} MB` : 'size auto'}`;
    formatSelect.appendChild(opt);
  });

  // Reset to 1080p Full HD preset
  selectPreset('video-1080');

  previewCard.classList.remove('hidden');
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==========================================================================
// Quality Preset Selector
// ==========================================================================

function selectPreset(presetKey) {
  state.selectedPreset = presetKey;
  presetChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.preset === presetKey);
  });

  if (presetKey === 'custom') {
    customFormatWrapper.classList.remove('hidden');
    state.customFormatId = formatSelect.value || 'bv*+ba/b';
  } else {
    customFormatWrapper.classList.add('hidden');
  }

  // Update download button label
  if (presetKey === 'audio-only') {
    downloadBtnText.textContent = 'Download MP3 Audio';
  } else if (presetKey === 'video-1080' || presetKey === 'best-video') {
    downloadBtnText.textContent = 'Download 1080p Full HD';
  } else if (presetKey === 'video-720' || presetKey === 'standard-720') {
    downloadBtnText.textContent = 'Download 720p HD';
  } else if (presetKey === 'video-480') {
    downloadBtnText.textContent = 'Download 480p SD';
  } else if (presetKey === 'video-360') {
    downloadBtnText.textContent = 'Download 360p Mobile';
  } else if (presetKey === 'custom') {
    downloadBtnText.textContent = 'Download Custom Stream';
  } else {
    downloadBtnText.textContent = 'Start Download';
  }
}

presetChips.forEach(chip => {
  chip.addEventListener('click', () => {
    selectPreset(chip.dataset.preset);
  });
});

formatSelect.addEventListener('change', () => {
  state.customFormatId = formatSelect.value;
});

// ==========================================================================
// Folder Selection & Open in Explorer
// ==========================================================================

folderButton.addEventListener('click', async () => {
  try {
    const chosen = await window.downloader.chooseFolder();
    if (chosen) {
      state.output = chosen;
      localStorage.setItem('uvdp-output', chosen);
      updateOutputDisplay();
      showToast('Download destination updated.', 'info');
    }
  } catch (err) {
    showToast('Failed to select folder: ' + err.message, 'error');
  }
});

openFolderBtn.addEventListener('click', async () => {
  if (!state.output) {
    showToast('No output folder selected yet.', 'warning');
    return;
  }
  try {
    await window.downloader.openFolder(state.output);
  } catch (e) {
    showToast('Could not open folder in file explorer.', 'error');
  }
});

outputDisplay.addEventListener('click', () => {
  if (state.output) {
    window.downloader.openFolder(state.output);
  }
});

// ==========================================================================
// Single Download Execution
// ==========================================================================

async function handleStartDownload() {
  const url = urlInput.value.trim();
  if (!url) return showToast('Paste a video URL first.', 'error');
  if (state.downloading) return;

  // If in web browser mode, directly launch download stream to system without interrupting modal
  if (window.isWebDemo) {
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    if (ytMatch) {
      const vId = ytMatch[1];
      window.open(`https://www.y2mate.com/youtube/${vId}`, '_blank');
    } else {
      window.open(`https://cobalt.tools/?u=${encodeURIComponent(url)}`, '_blank');
    }

    showToast('⚡ Direct download initiated to your system!', 'success', 3500);
    runWebHudSimulation(url);
    return;
  }

  if (!state.output) return showToast('Select a destination folder first.', 'error');

  const audioOnly = state.selectedPreset === 'audio-only';
  let targetFormat = 'bestvideo+bestaudio/best';
  if (audioOnly) {
    targetFormat = 'bestaudio/best';
  } else if (state.selectedPreset === 'video-1080' || state.selectedPreset === 'best-video') {
    targetFormat = 'bestvideo+bestaudio/best';
  } else if (state.selectedPreset === 'video-720' || state.selectedPreset === 'standard-720') {
    targetFormat = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]/best';
  } else if (state.selectedPreset === 'video-480') {
    targetFormat = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best[height<=480]/best';
  } else if (state.selectedPreset === 'video-360') {
    targetFormat = 'bestvideo[height<=360]+bestaudio/best[height<=360]/best[height<=360]/best';
  } else if (state.selectedPreset === 'custom') {
    targetFormat = state.customFormatId;
  }

  state.downloading = true;
  state.paused = false;
  downloadButton.disabled = true;
  pauseButton.disabled = false;
  cancelButton.disabled = false;
  revealCompletedBtn.classList.add('hidden');

  // Activate HUD
  transferHud.classList.remove('hidden');
  progressTitle.textContent = state.info?.title || 'Downloading media...';
  progressPercent.textContent = '0%';
  progressDetail.textContent = 'Initiating download stream...';
  progressBar.style.width = '2%';
  speedText.textContent = '—';
  etaText.textContent = '—';
  transferHud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  appendLogLine(`[download] Starting: ${url}`, 'download');
  appendLogLine(`[download] Format rule: ${targetFormat} | Output: ${state.output}`, 'download');

  try {
    const res = await window.downloader.startDownload({
      url,
      format: targetFormat,
      output: state.output,
      options: state.options,
      audioOnly,
      embedThumbnail: embedThumbnailCheck.checked,
      embedSubs: embedSubsCheck.checked
    });

    if (!res.ok) {
      showToast(res.error || 'Failed to start download.', 'error');
      appendLogLine(`[error] ${res.error}`, 'error');
      state.downloading = false;
      downloadButton.disabled = false;
      pauseButton.disabled = true;
      cancelButton.disabled = true;
      return;
    }

    // Await download completion via event
    await new Promise(resolve => {
      state.resolveDownload = resolve;
    });

  } catch (err) {
    showToast('Download error: ' + err.message, 'error');
    appendLogLine(`[error] Exception during download: ${err.message}`, 'error');
  } finally {
    state.downloading = false;
    downloadButton.disabled = false;
    pauseButton.disabled = true;
    cancelButton.disabled = true;
  }
}

downloadButton.addEventListener('click', handleStartDownload);

pauseButton.addEventListener('click', async () => {
  if (!state.downloading) return;
  await window.downloader.pauseDownload();
  state.downloading = false;
  state.paused = true;
  pauseButton.disabled = true;
  cancelButton.disabled = true;
  downloadButton.disabled = false;
  progressDetail.textContent = 'Download paused. Click download to resume.';
  showToast('Download paused.', 'info');
  appendLogLine('[download] Paused download stream.', 'info');
});

cancelButton.addEventListener('click', async () => {
  await window.downloader.cancelDownload();
  state.downloading = false;
  pauseButton.disabled = true;
  cancelButton.disabled = true;
  downloadButton.disabled = false;
  progressPercent.textContent = 'Cancelled';
  progressDetail.textContent = 'Download was cancelled.';
  showToast('Download cancelled.', 'warning');
  appendLogLine('[download] Download cancelled by user.', 'error');
  if (state.resolveDownload) state.resolveDownload();
});

revealCompletedBtn.addEventListener('click', async () => {
  if (lastDownloadedFile) {
    await window.downloader.showItemInFolder(lastDownloadedFile);
  } else if (state.output) {
    await window.downloader.openFolder(state.output);
  }
});

// IPC Stream Listeners
window.downloader.onProgress(data => {
  const pct = Math.min(Math.max(data.percent || 0, 0), 100);
  progressBar.style.width = `${pct}%`;
  progressPercent.textContent = `${Math.round(pct)}%`;
  speedText.textContent = data.speed || '—';
  etaText.textContent = data.eta ? data.eta : '—';
  progressDetail.textContent = pct >= 99 ? 'Merging audio/video tracks...' : 'Downloading streams...';
});

window.downloader.onFinished(data => {
  if (data.ok) {
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressDetail.textContent = 'Download & Merging Complete!';
    revealCompletedBtn.classList.remove('hidden');
    lastDownloadedFile = data.filePath || null;
    showToast('Download completed successfully!', 'success');
    appendLogLine('[finished] Download completed successfully.', 'download');

    // Add to History
    addHistoryItem({
      title: state.info?.title || 'Downloaded Media',
      url: urlInput.value.trim(),
      format: state.selectedPreset === 'audio-only' ? 'MP3 Audio' : 'MP4 Video',
      when: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      filePath: data.filePath || null,
      thumbnail: state.info?.thumbnail || null
    });
  } else {
    progressDetail.textContent = 'Download failed.';
    showToast(data.error || 'Download encountered an error.', 'error', 6000);
    appendLogLine(`[error] Download failed: ${data.error}`, 'error');
  }

  if (state.resolveDownload) state.resolveDownload();
});

window.downloader.onLog(errText => {
  if (errText) {
    appendLogLine(`[stderr] ${errText}`, 'error');
  }
});

window.downloader.onRawLog(text => {
  text.split(/\r?\n/).filter(Boolean).forEach(line => {
    let type = 'system';
    if (line.includes('[download]')) type = 'download';
    else if (line.includes('[Merger]') || line.includes('[ffmpeg]')) type = 'merger';
    else if (line.includes('[info]') || line.includes('[Metadata]')) type = 'info';
    else if (line.toLowerCase().includes('error')) type = 'error';

    appendLogLine(line, type);
  });
});

// ==========================================================================
// Mode Tabs: Single vs Batch
// ==========================================================================

tabSingle.addEventListener('click', () => {
  state.activeMode = 'single';
  tabSingle.classList.add('active');
  tabBatch.classList.remove('active');
  singleView.classList.add('active');
  batchView.classList.remove('active');
});

tabBatch.addEventListener('click', () => {
  state.activeMode = 'batch';
  tabBatch.classList.add('active');
  tabSingle.classList.remove('active');
  batchView.classList.add('active');
  singleView.classList.remove('active');
  updateBatchList();
});

// ==========================================================================
// Batch Queue Manager
// ==========================================================================

function getBatchUrls() {
  return batchInput.value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^https?:\/\//i.test(line));
}

function updateBatchList() {
  const urls = getBatchUrls();
  batchBadge.textContent = `${urls.length} URL${urls.length === 1 ? '' : 's'} in queue`;
  batchTabCount.textContent = urls.length;

  if (!urls.length) {
    queueList.innerHTML = `
      <div class="empty-queue-state">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <p>Paste multiple links above to queue batch downloads</p>
      </div>
    `;
    queueProgressCount.textContent = '0 / 0 Completed';
    return;
  }

  queueList.innerHTML = '';
  urls.forEach((url, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = `queue-item-${i}`;
    item.innerHTML = `
      <div class="queue-item-url" title="${escapeHtml(url)}">
        <strong>#${i + 1}</strong> · ${escapeHtml(url)}
      </div>
      <span class="queue-status-tag pending" id="queue-status-${i}">Pending</span>
    `;
    queueList.appendChild(item);
  });
}

batchInput.addEventListener('input', updateBatchList);

clearBatchBtn.addEventListener('click', () => {
  batchInput.value = '';
  updateBatchList();
});

startBatchBtn.addEventListener('click', async () => {
  const urls = getBatchUrls();
  if (!urls.length) {
    return showToast('Paste at least one valid video URL in the box.', 'error');
  }
  if (!state.output) {
    return showToast('Choose a destination folder first.', 'error');
  }
  if (state.batchRunning) return;

  state.batchRunning = true;
  startBatchBtn.disabled = true;
  clearBatchBtn.disabled = true;

  transferHud.classList.remove('hidden');
  transferHud.scrollIntoView({ behavior: 'smooth' });

  let completed = 0;
  queueProgressCount.textContent = `0 / ${urls.length} Completed`;

  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i];
    const statusTag = $(`#queue-status-${i}`);
    if (statusTag) {
      statusTag.className = 'queue-status-tag downloading';
      statusTag.textContent = 'Downloading...';
    }

    progressTitle.textContent = `[${i + 1}/${urls.length}] ${currentUrl}`;
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';

    appendLogLine(`[batch] Processing item ${i + 1}/${urls.length}: ${currentUrl}`, 'download');

    const res = await window.downloader.startDownload({
      url: currentUrl,
      format: batchAudioOnly.checked ? 'bestaudio/best' : 'bv*+ba/b',
      output: state.output,
      options: state.options,
      audioOnly: batchAudioOnly.checked
    });

    if (!res.ok) {
      if (statusTag) {
        statusTag.className = 'queue-status-tag failed';
        statusTag.textContent = 'Failed';
      }
      showToast(`Item ${i + 1} failed: ${res.error}`, 'error');
      continue;
    }

    await new Promise(resolve => {
      state.resolveDownload = resolve;
    });

    completed++;
    queueProgressCount.textContent = `${completed} / ${urls.length} Completed`;
    if (statusTag) {
      statusTag.className = 'queue-status-tag done';
      statusTag.textContent = 'Done ✓';
    }
  }

  state.batchRunning = false;
  startBatchBtn.disabled = false;
  clearBatchBtn.disabled = false;
  showToast(`Batch completed: ${completed} of ${urls.length} downloads finished!`, 'success');
});

// ==========================================================================
// History / Archive Manager
// ==========================================================================

function addHistoryItem(item) {
  state.history = [item, ...state.history.filter(h => h.url !== item.url)].slice(0, 25);
  localStorage.setItem('uvdp-history', JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = `
      <div class="empty-history-state">
        <div class="empty-history-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </div>
        <p>Your finished downloads will be archived here for instant access.</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = '';
  state.history.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'history-card-item';
    card.innerHTML = `
      <div class="history-main-info">
        <div class="history-icon-badge">✓</div>
        <div class="history-text">
          <span class="history-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <div class="history-meta-sub">
            <span>${escapeHtml(item.format || 'Media')}</span>
            <span>·</span>
            <span>${escapeHtml(item.when)}</span>
          </div>
        </div>
      </div>
      <div class="history-item-actions">
        ${item.filePath ? `
          <button class="history-item-btn open-file" data-index="${index}" title="Reveal in File Explorer">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Show</span>
          </button>
        ` : ''}
        <button class="history-item-btn copy-url" data-url="${escapeHtml(item.url)}" title="Copy Source Link">
          <span>Copy</span>
        </button>
        <button class="history-item-btn delete-item" data-index="${index}" title="Remove from History">
          <span>✕</span>
        </button>
      </div>
    `;

    card.querySelector('.copy-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(item.url);
      showToast('Source URL copied to clipboard', 'info', 2000);
    });

    card.querySelector('.open-file')?.addEventListener('click', () => {
      if (item.filePath) {
        window.downloader.showItemInFolder(item.filePath);
      }
    });

    card.querySelector('.delete-item')?.addEventListener('click', () => {
      state.history.splice(index, 1);
      localStorage.setItem('uvdp-history', JSON.stringify(state.history));
      renderHistory();
    });

    historyList.appendChild(card);
  });
}

clearHistory.addEventListener('click', () => {
  if (confirm('Clear all items from download history?')) {
    state.history = [];
    localStorage.removeItem('uvdp-history');
    renderHistory();
    showToast('History cleared.', 'info');
  }
});

// ==========================================================================
// Terminal Console Drawer
// ==========================================================================

function appendLogLine(lineText, type = 'system') {
  const line = document.createElement('div');
  line.className = `term-line ${type}`;
  line.textContent = lineText;
  terminalBody.appendChild(line);

  // Keep at most 200 lines to avoid memory bloating
  while (terminalBody.children.length > 200) {
    terminalBody.removeChild(terminalBody.firstChild);
  }

  terminalBody.scrollTop = terminalBody.scrollHeight;
}

toggleTerminalBtn.addEventListener('click', () => {
  terminalDrawer.classList.toggle('hidden');
  if (!terminalDrawer.classList.contains('hidden')) {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
});

closeTerminalBtn.addEventListener('click', () => {
  terminalDrawer.classList.add('hidden');
});

clearLogBtn.addEventListener('click', () => {
  terminalBody.innerHTML = '<div class="term-line system">[system] Console cleared.</div>';
});

copyLogBtn.addEventListener('click', () => {
  const text = Array.from(terminalBody.children).map(c => c.textContent).join('\n');
  navigator.clipboard.writeText(text);
  showToast('Console log copied to clipboard.', 'info');
});

// ==========================================================================
// Settings Modal
// ==========================================================================

openSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
  }
});

browseCookiesBtn.addEventListener('click', async () => {
  try {
    const file = await window.downloader.chooseFile({
      title: 'Select Netscape cookies.txt file'
    });
    if (file) {
      cookiesInput.value = file;
    }
  } catch (err) {
    showToast('Could not open file chooser: ' + err.message, 'error');
  }
});

saveSettingsBtn.addEventListener('click', () => {
  state.options.proxy = proxyInput.value.trim();
  state.options.cookies = cookiesInput.value.trim();
  state.options.browser = browserCookieSelect ? browserCookieSelect.value : 'none';
  localStorage.setItem('uvdp-options', JSON.stringify(state.options));
  settingsModal.classList.add('hidden');
  showToast('Settings saved successfully.', 'success');
  appendLogLine(`[config] Delivery settings updated (Proxy: ${state.options.proxy || 'none'}, Cookies: ${state.options.cookies || 'none'}, Browser: ${state.options.browser})`, 'info');
});

// ==========================================================================
// Web Download Delivery Modal & Showcase Handlers
// ==========================================================================

function openWebDownloadModal(url) {
  const modal = $('#webDownloadModal');
  const titleEl = $('#modalVideoTitle');
  const directBtn = $('#webDirectDownloadBtn');
  if (!modal) return;

  if (state.info?.title) {
    titleEl.textContent = state.info.title;
  } else {
    titleEl.textContent = 'Selected Media Stream';
  }

  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (ytMatch) {
    const vId = ytMatch[1];
    directBtn.href = `https://www.y2mate.com/youtube/${vId}`;
  } else {
    directBtn.href = `https://cobalt.tools/?u=${encodeURIComponent(url)}`;
  }

  modal.classList.remove('hidden');
}

function runWebHudSimulation(url) {
  const audioOnly = state.selectedPreset === 'audio-only';
  let targetFormat = 'bestvideo+bestaudio/best';
  if (audioOnly) targetFormat = 'bestaudio/best';
  else if (state.selectedPreset === 'video-720') targetFormat = 'bestvideo[height<=720]+bestaudio/best';

  state.downloading = true;
  state.paused = false;
  downloadButton.disabled = true;
  pauseButton.disabled = false;
  cancelButton.disabled = false;
  revealCompletedBtn.classList.add('hidden');

  transferHud.classList.remove('hidden');
  progressTitle.textContent = state.info?.title || 'Downloading media...';
  progressPercent.textContent = '0%';
  progressDetail.textContent = 'Initiating download stream...';
  progressBar.style.width = '2%';
  speedText.textContent = '—';
  etaText.textContent = '—';
  transferHud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  appendLogLine(`[download] Starting: ${url}`, 'download');
  appendLogLine(`[download] Format rule: ${targetFormat} | Output: ${state.output}`, 'download');

  window.downloader.startDownload({
    url,
    format: targetFormat,
    output: state.output,
    options: state.options,
    audioOnly
  });
}

const webDownloadModal = $('#webDownloadModal');
const closeWebDownloadBtn = $('#closeWebDownloadBtn');
const copyRunCmdBtn = $('#copyRunCmdBtn');
const downloadThumbnailBtn = $('#downloadThumbnailBtn');
const simulateDesktopHudBtn = $('#simulateDesktopHudBtn');
const dismissBannerBtn = $('#dismissBannerBtn');

dismissBannerBtn?.addEventListener('click', () => {
  $('#webShowcaseBanner')?.classList.add('hidden');
});

closeWebDownloadBtn?.addEventListener('click', () => {
  webDownloadModal?.classList.add('hidden');
});

webDownloadModal?.addEventListener('click', e => {
  if (e.target === webDownloadModal) {
    webDownloadModal.classList.add('hidden');
  }
});

copyRunCmdBtn?.addEventListener('click', () => {
  const code = $('#desktopRunCode')?.textContent || 'git clone https://github.com/ArfaaTaj-savas/OmniStream.git && npm install && npm start';
  navigator.clipboard.writeText(code);
  showToast('Copied desktop command to clipboard!', 'success');
});

downloadThumbnailBtn?.addEventListener('click', () => {
  if (state.info?.thumbnail) {
    window.open(state.info.thumbnail, '_blank');
    showToast('Opening HD cover image in new tab...', 'info');
  } else {
    showToast('No thumbnail found for this video.', 'warning');
  }
});

simulateDesktopHudBtn?.addEventListener('click', () => {
  webDownloadModal?.classList.add('hidden');
  const url = urlInput.value.trim();
  runWebHudSimulation(url);
});

// Global Keyboard Escape
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (webDownloadModal && !webDownloadModal.classList.contains('hidden')) {
      webDownloadModal.classList.add('hidden');
    }
    if (!settingsModal.classList.contains('hidden')) {
      settingsModal.classList.add('hidden');
    }
    if (!terminalDrawer.classList.contains('hidden')) {
      terminalDrawer.classList.add('hidden');
    }
  }
});

// ==========================================================================
// Initialize on Load
// ==========================================================================

initTheme();
initEngineAndPaths();
renderHistory();
updateUrlInputState();
