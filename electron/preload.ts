import { contextBridge, ipcRenderer } from "electron";

export interface OpenedPdf {
  filePath: string;
  data: ArrayBuffer;
}

export interface OpenedImage {
  filePath: string;
  name: string;
  data: ArrayBuffer;
}

const api = {
  openPdf: (): Promise<OpenedPdf | null> => ipcRenderer.invoke("dialog:openPdf"),
  openImages: (): Promise<OpenedImage[]> => ipcRenderer.invoke("dialog:openImages"),
  readSystemFont: (fileName: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke("fonts:read", fileName),
  savePdf: (suggestedName: string, data: ArrayBuffer): Promise<string | null> =>
    ipcRenderer.invoke("dialog:savePdf", suggestedName, data),
};

contextBridge.exposeInMainWorld("modifPdf", api);

export type ModifPdfApi = typeof api;
