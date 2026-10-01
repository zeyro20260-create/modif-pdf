import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs/promises";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1e1f22",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC: file dialogs & filesystem access ----
// The renderer never touches Node/fs directly; every disk operation is
// brokered here so the renderer can keep nodeIntegration disabled.

ipcMain.handle("dialog:openPdf", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Ouvrir un PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  return { filePath, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
});

ipcMain.handle("dialog:openImages", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Ouvrir des images",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  const files = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const data = await fs.readFile(filePath);
      return {
        filePath,
        name: path.basename(filePath),
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      };
    })
  );
  return files;
});

ipcMain.handle("dialog:savePdf", async (_event, suggestedName: string, data: ArrayBuffer) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Enregistrer le PDF",
    defaultPath: suggestedName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, Buffer.from(data));
  return result.filePath;
});
