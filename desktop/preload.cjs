const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  getDesktopInfo: 'suowang:get-desktop-info',
  getVersionInfo: 'suowang:get-version-info',
  openGitHubTarget: 'suowang:open-github-target',
  openDataDirectory: 'suowang:open-data-directory',
  saveExport: 'suowang:save-export',
  chooseAvatar: 'suowang:choose-avatar',
  restoreDatabase: 'suowang:restore-database',
});

contextBridge.exposeInMainWorld('suowangDesktop', Object.freeze({
  getDesktopInfo: () => ipcRenderer.invoke(channels.getDesktopInfo),
  getVersionInfo: () => ipcRenderer.invoke(channels.getVersionInfo),
  openGitHubTarget: (target) => ipcRenderer.invoke(channels.openGitHubTarget, target),
  openDataDirectory: () => ipcRenderer.invoke(channels.openDataDirectory),
  saveExport: (kind) => ipcRenderer.invoke(channels.saveExport, kind),
  chooseAvatar: () => ipcRenderer.invoke(channels.chooseAvatar),
  restoreDatabase: () => ipcRenderer.invoke(channels.restoreDatabase),
}));
