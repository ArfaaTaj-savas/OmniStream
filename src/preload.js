const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('downloader', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  chooseFile: options => ipcRenderer.invoke('choose-file', options),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  openFolder: folder => ipcRenderer.invoke('open-folder', folder),
  showItemInFolder: targetPath => ipcRenderer.invoke('show-item-in-folder', targetPath),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  checkEngine: () => ipcRenderer.invoke('check-engine'),
  inspectUrl: payload => ipcRenderer.invoke('inspect-url', payload),
  startDownload: payload => ipcRenderer.invoke('start-download', payload),
  pauseDownload: () => ipcRenderer.invoke('pause-download'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  onProgress: callback => ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  onFinished: callback => ipcRenderer.on('download-finished', (_event, data) => callback(data)),
  onLog: callback => ipcRenderer.on('download-log', (_event, data) => callback(data)),
  onRawLog: callback => ipcRenderer.on('download-raw-log', (_event, data) => callback(data))
});
