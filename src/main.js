const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let activeJob = null;

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'logo.png');
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#0a0d14',
    title: 'OmniStream Pro',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function binary(name) { return process.env[name.toUpperCase()] || name; }
function send(channel, payload) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); }
function safeName(value) { return String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().slice(0, 120) || 'video'; }

function commonArgs(options = {}) {
  const args = [
    '--no-warnings',
    '--newline',
    '--retries', '3',
    '--fragment-retries', '3',
    '--extractor-retries', '2',
    '--retry-sleep', 'linear=1::3',
    '--concurrent-fragments', '2',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=web_embedded,web,android'
  ];
  if (options.proxy) args.push('--proxy', options.proxy);
  if (options.cookies) args.push('--cookies', options.cookies);
  if (options.browser && options.browser !== 'none') {
    args.push('--cookies-from-browser', options.browser);
  }
  return args;
}

function runYtdlp(args, handlers = {}) {
  const configuredBinary = process.env['YT-DLP'];
  const command = configuredBinary || (process.platform === 'win32' ? 'py' : 'yt-dlp');
  const commandArgs = (configuredBinary || process.platform !== 'win32') ? args : ['-m', 'yt_dlp', ...args];
  const child = spawn(command, commandArgs, { windowsHide: true });
  let stdout = '';
  let stderr = '';
  let finished = false;
  const finish = result => { if (!finished) { finished = true; handlers.close?.(result); } };

  child.stdout.on('data', data => {
    stdout += data;
    handlers.stdout?.(data.toString());
  });
  child.stderr.on('data', data => {
    stderr += data;
    handlers.stderr?.(data.toString());
  });
  child.on('error', error => {
    const message = error.code === 'ENOENT'
      ? 'yt-dlp is not installed or is not available on PATH. Install yt-dlp, then restart the app.'
      : error.message;
    handlers.error?.(error);
    finish({ code: -1, stdout, stderr: message });
  });
  child.on('close', code => finish({ code, stdout, stderr }));
  return child;
}

function friendlyError(message, fallback) {
  const text = String(message || '').trim();
  if (/confirm you.?re not a bot|sign in to confirm/i.test(text)) {
    return 'YouTube requires verification for this video. You can select your browser cookies or a cookies.txt file in Settings.';
  }
  if (/Private video|This video is private/i.test(text)) {
    return 'This video is private or restricted by the author.';
  }
  if (/Video unavailable|This video is not available/i.test(text)) {
    return 'This video is unavailable or has been removed.';
  }
  if (/429|Too Many Requests/i.test(text)) {
    return 'Rate limit reached from this network IP. Please wait a moment or configure a proxy in Settings.';
  }
  return text.split('\n').filter(Boolean).slice(-1)[0] || fallback;
}

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Destination Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('choose-file', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Select File',
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Cookies / Text', extensions: ['txt'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-default-folder', () => {
  try {
    return app.getPath('downloads');
  } catch {
    return null;
  }
});

ipcMain.handle('open-folder', async (_event, folder) => {
  if (folder && fs.existsSync(folder)) {
    await shell.openPath(folder);
    return true;
  }
  return false;
});

ipcMain.handle('show-item-in-folder', async (_event, targetPath) => {
  if (targetPath && fs.existsSync(targetPath)) {
    shell.showItemInFolder(targetPath);
    return true;
  } else if (targetPath && fs.existsSync(path.dirname(targetPath))) {
    await shell.openPath(path.dirname(targetPath));
    return true;
  }
  return false;
});

ipcMain.handle('read-clipboard', () => {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
});

ipcMain.handle('check-engine', async () => {
  return new Promise(resolve => {
    runYtdlp(['--version'], {
      close: ({ code, stdout }) => {
        if (code === 0 && stdout.trim()) {
          resolve({ ok: true, version: stdout.trim() });
        } else {
          resolve({ ok: false, error: 'yt-dlp engine not responding' });
        }
      }
    });
  });
});

ipcMain.handle('inspect-url', async (_event, { url, options }) => new Promise(resolve => {
  const args = [...commonArgs(options), '--dump-single-json', '--no-playlist', url];
  runYtdlp(args, { close: ({ code, stdout, stderr }) => {
    if (code !== 0) return resolve({ ok: false, error: friendlyError(stderr, 'Could not inspect this URL.') });
    try {
      let jsonStr = stdout.trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
      const data = JSON.parse(jsonStr);
      const formats = (data.formats || [])
        .filter(f => f.format_id && (f.vcodec !== 'none' || f.acodec !== 'none'))
        .map(f => ({
          id: f.format_id,
          label: `${f.ext || 'file'} · ${f.resolution || (f.height ? `${f.height}p` : (f.abr ? `${Math.round(f.abr)} kbps` : 'adaptive'))} · ${f.filesize ? `${(f.filesize / 1048576).toFixed(1)} MB` : (f.filesize_approx ? `~${(f.filesize_approx / 1048576).toFixed(1)} MB` : 'size auto')}`,
          resolution: f.resolution || (f.height ? `${f.height}p` : ''),
          height: f.height || 0,
          fps: f.fps || null,
          ext: f.ext || '',
          vcodec: f.vcodec || '',
          acodec: f.acodec || '',
          abr: f.abr || 0,
          filesize: f.filesize || f.filesize_approx || null,
          hasVideo: f.vcodec !== 'none' && f.vcodec !== undefined,
          hasAudio: f.acodec !== 'none' && f.acodec !== undefined
        }));

      resolve({
        ok: true,
        info: {
          id: data.id || '',
          title: data.title || 'Untitled video',
          uploader: data.uploader || data.channel || data.creator || '',
          duration: data.duration || 0,
          thumbnail: data.thumbnail || '',
          webpage_url: data.webpage_url || url,
          extractor: data.extractor_key || data.extractor || '',
          formats
        }
      });
    } catch {
      resolve({ ok: false, error: 'The extractor returned an unreadable response.' });
    }
  }});
}));

ipcMain.handle('start-download', async (_event, payload) => {
  if (activeJob) return { ok: false, error: 'A download is already running.' };
  const { url, format, output, options = {}, audioOnly = false, embedThumbnail = false, embedSubs = false } = payload;
  if (!url || !output) return { ok: false, error: 'A URL and output folder are required.' };
  fs.mkdirSync(output, { recursive: true });
  const template = path.join(output, '%(title)s [%(id)s].%(ext)s');

  const args = [...commonArgs(options)];
  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('--format', format || 'bv*+ba/b/best', '--merge-output-format', 'mp4');
  }
  if (embedThumbnail) args.push('--embed-thumbnail');
  if (embedSubs) args.push('--embed-subs', '--sub-langs', 'all');
  args.push('--output', template, '--progress', url);

  let downloadedFilePath = null;

  activeJob = runYtdlp(args, {
    stdout: text => {
      send('download-raw-log', text);
      text.split(/\r?\n/).filter(Boolean).forEach(line => {
        const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+.*?\s+at\s+(.+?)\s+ETA\s+(.+)/);
        if (match) send('download-progress', { percent: Number(match[1]), speed: match[2], eta: match[3] });
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          send('download-progress', { percent: 99, speed: 'Processing', eta: 'Almost done' });
        }
        const destMatch = line.match(/\[(?:download|Merger)\]\s+Destination:\s+(.+)/i) || line.match(/\[(?:ffmpeg|Merger)\]\s+Merging formats into "(.+)"/i);
        if (destMatch && destMatch[1]) {
          downloadedFilePath = destMatch[1].trim();
        }
      });
    },
    stderr: text => {
      send('download-raw-log', text);
      if (text.toLowerCase().includes('error')) send('download-log', text.trim());
    },
    close: ({ code, stderr }) => {
      send('download-finished', {
        ok: code === 0,
        filePath: code === 0 ? downloadedFilePath : null,
        error: code === 0 ? null : friendlyError(stderr, 'Download failed.')
      });
      activeJob = null;
    }
  });
  return { ok: true };
});

ipcMain.handle('pause-download', async () => {
  if (!activeJob) return { ok: false };
  activeJob.kill('SIGINT');
  activeJob = null;
  return { ok: true };
});

ipcMain.handle('cancel-download', async () => {
  if (activeJob) {
    activeJob.kill('SIGTERM');
    activeJob = null;
  }
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (activeJob) activeJob.kill('SIGTERM'); });
