const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getDefaultDownloadPath: () => ipcRenderer.invoke("tidecanvas-get-default-download-path"),
  selectDirectory: () => ipcRenderer.invoke("tidecanvas-select-directory"),
  saveFile: (targetPath, data) => ipcRenderer.invoke("tidecanvas-save-file", targetPath, data),
  requestUrl: (payload) => ipcRenderer.invoke("tidecanvas-request-url", payload),
  fetchImageAsDataUrl: (url) => ipcRenderer.invoke("tidecanvas-fetch-image-as-dataurl", url),
  concatVideos: (payload) => ipcRenderer.invoke("tidecanvas-concat-videos", payload),
});
