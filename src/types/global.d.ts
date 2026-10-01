import type { ModifPdfApi } from "../../electron/preload";

declare global {
  interface Window {
    modifPdf: ModifPdfApi;
  }
}

export {};
