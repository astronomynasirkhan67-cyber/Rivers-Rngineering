const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let win = null;
let current = null; // running child process

// Folder that holds node.exe, the JDK and the JADX jar.
function binDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "bin")
    : path.join(__dirname, "resources");
}

function runtimePaths() {
  const bin = binDir();
  const bundledNode = path.join(bin, "node.exe");
  const jdk = path.join(bin, "jdk");
  const jar = path.join(bin, "jadx-headless-mcp-0.7.1-all.jar");
  return {
    node: fs.existsSync(bundledNode) ? bundledNode : "node",
    jdk: fs.existsSync(jdk) ? jdk : null,
    jar: fs.existsSync(jar) ? jar : null,
    script: path.join(__dirname, "node_modules", "rea-agents", "scripts", "rea.mjs"),
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#0f1117",
    title: "REA Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
}

ipcMain.handle("pick-apk", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Select an APK file",
    properties: ["openFile"],
    filters: [{ name: "Android package", extensions: ["apk"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("save-output", async (_e, text) => {
  const r = await dialog.showSaveDialog(win, {
    title: "Save result",
    defaultPath: "rea-result.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, text, "utf8");
  return true;
});

ipcMain.handle("cancel", () => {
  if (current) {
    current.kill();
    current = null;
  }
});

// args is an array such as ["inspect-android-package", "C:\\x.apk"].
// It is passed straight to the process (no shell), so nothing is interpreted.
ipcMain.handle("run-rea", (event, args) => {
  return new Promise((resolve) => {
    if (current) {
      resolve({ code: -1, error: "Another task is still running." });
      return;
    }
    if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) {
      resolve({ code: -1, error: "Invalid arguments." });
      return;
    }
    const rt = runtimePaths();
    const env = { ...process.env };
    if (rt.jar) env.REA_JADX_MCP_JAR = rt.jar;
    if (rt.jdk) {
      env.JAVA_HOME = rt.jdk;
      env.PATH = path.join(rt.jdk, "bin") + path.delimiter + (env.PATH || "");
    }

    let child;
    try {
      child = spawn(rt.node, [rt.script, ...args], { env, windowsHide: true });
    } catch (err) {
      resolve({ code: -1, error: String(err) });
      return;
    }
    current = child;

    const send = (chunk) => event.sender.send("rea-output", chunk.toString());
    child.stdout.on("data", send);
    child.stderr.on("data", send);
    child.on("error", (err) => {
      current = null;
      resolve({ code: -1, error: String(err) });
    });
    child.on("close", (code) => {
      current = null;
      resolve({ code });
    });
  });
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
