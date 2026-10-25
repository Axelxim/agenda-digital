const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoEnOrdenDesktop', {
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  onRefreshAgenda(callback) {
    const listener = () => callback();
    ipcRenderer.on('desktop:refresh-agenda', listener);
    return () => ipcRenderer.removeListener('desktop:refresh-agenda', listener);
  },
  startGoogleLogin() {
    return ipcRenderer.invoke('desktop:start-google-login');
  },
  onAuthSession(callback) {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on('desktop:auth-session', listener);
    return () => ipcRenderer.removeListener('desktop:auth-session', listener);
  },
  apiRequest(request) {
    return ipcRenderer.invoke('desktop:api-request', request);
  },
});
