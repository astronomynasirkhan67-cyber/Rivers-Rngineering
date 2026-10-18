const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rea", {
  pickApk: () => ipcRenderer.invoke("pick-apk"),
  run: (args) => ipcRenderer.invoke("run-rea", args),
  cancel: () => ipcRenderer.invoke("cancel"),
  saveOutput: (text) => ipcRenderer.invoke("save-output", text),
  onOutput: (cb) => ipcRenderer.on("rea-output", (_e, text) => cb(text)),
});
