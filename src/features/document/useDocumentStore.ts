import { create } from "zustand";
import type { PDFDocument } from "pdf-lib";
import type * as pdfjsLib from "pdfjs-dist";
import {
  loadPdf,
  createBlankDocument,
  resyncPdfJs,
  rotatePage as engineRotatePage,
  deletePage as engineDeletePage,
  reorderPages as engineReorderPages,
  mergeDocumentInto,
  appendImageAsPage,
  extractPagesAsNewDocument,
  drawTextOverlay,
  drawImageOverlay,
  listFormFields,
  setFormFieldValue as engineSetFormFieldValue,
  flattenForm as engineFlattenForm,
  saveToBytes,
} from "@/lib/pdfEngine";
import { detectImageFormat } from "@/lib/imageFormat";
import { arrayBufferToDataUrl, loadImageNaturalSize } from "@/lib/dataUrl";
import type { ToolId, FormFieldState, DraftOverlay } from "./documentTypes";

interface DocumentState {
  fileName: string | null;
  pdfLibDoc: PDFDocument | null;
  pdfJsDoc: pdfjsLib.PDFDocumentProxy | null;
  pageCount: number;
  currentPageIndex: number;
  zoom: number;
  activeTool: ToolId;
  isDirty: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  formFields: FormFieldState[];
  lastSignatureDataUrl: string | null;
  undoStack: ArrayBuffer[];
  redoStack: ArrayBuffer[];
  draftOverlays: DraftOverlay[];

  openFromBytes: (fileName: string, bytes: ArrayBuffer) => Promise<void>;
  newBlankDocument: () => Promise<void>;
  setActiveTool: (tool: ToolId) => void;
  setCurrentPage: (index: number) => void;
  setZoom: (zoom: number) => void;

  rotateCurrentPage: (delta: 90 | -90) => Promise<void>;
  deletePage: (pageIndex: number) => Promise<void>;
  movePage: (fromIndex: number, toIndex: number) => Promise<void>;

  addImagesAsPages: (images: ArrayBuffer[]) => Promise<void>;
  mergePdfBytes: (bytes: ArrayBuffer) => Promise<void>;
  splitCurrentPageOut: (pageIndex: number) => Promise<ArrayBuffer>;

  addTextAt: (pageIndex: number, xRatio: number, yRatio: number, text: string, fontSize: number, colorHex: string) => Promise<void>;
  addImageAt: (pageIndex: number, xRatio: number, yRatio: number, widthRatio: number, heightRatio: number, imageBytes: ArrayBuffer) => Promise<void>;

  addDraftText: (pageIndex: number, xRatio: number, yRatio: number) => string;
  addDraftImage: (pageIndex: number, xRatio: number, yRatio: number, imageBytes: ArrayBuffer) => Promise<string>;
  updateDraftOverlay: (id: string, patch: Partial<DraftOverlay>) => void;
  removeDraftOverlay: (id: string) => void;
  commitDraftOverlay: (id: string) => Promise<void>;
  commitAllDraftOverlays: () => Promise<void>;

  refreshFormFields: () => void;
  updateFormFieldValue: (field: FormFieldState, value: string) => Promise<void>;
  flattenForm: () => Promise<void>;

  setLastSignature: (dataUrl: string) => void;

  undo: () => Promise<void>;
  redo: () => Promise<void>;

  exportBytes: () => Promise<ArrayBuffer>;
}

const MAX_HISTORY = 25;

async function resync(pdfLibDoc: PDFDocument) {
  const pdfJsDoc = await resyncPdfJs(pdfLibDoc);
  return { pdfJsDoc, pageCount: pdfLibDoc.getPageCount() };
}

/**
 * Snapshots the document's current bytes onto the undo stack before a mutation is
 * applied. Byte snapshots (rather than cloning the live PDFDocument) keep undo/redo
 * trivially correct: reloading bytes with pdf-lib + pdf.js always reproduces an
 * identical, fully independent document state.
 */
async function pushUndoSnapshot(get: () => DocumentState, set: (partial: Partial<DocumentState>) => void) {
  const { pdfLibDoc, undoStack } = get();
  if (!pdfLibDoc) return;
  const bytes = await saveToBytes(pdfLibDoc);
  const nextStack = [...undoStack, bytes].slice(-MAX_HISTORY);
  set({ undoStack: nextStack, redoStack: [] });
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  fileName: null,
  pdfLibDoc: null,
  pdfJsDoc: null,
  pageCount: 0,
  currentPageIndex: 0,
  zoom: 1.1,
  activeTool: "select",
  isDirty: false,
  isBusy: false,
  errorMessage: null,
  formFields: [],
  lastSignatureDataUrl: null,
  undoStack: [],
  redoStack: [],
  draftOverlays: [],

  openFromBytes: async (fileName, bytes) => {
    set({ isBusy: true, errorMessage: null });
    try {
      const { pdfLibDoc, pdfJsDoc } = await loadPdf(bytes);
      set({
        fileName,
        pdfLibDoc,
        pdfJsDoc,
        pageCount: pdfLibDoc.getPageCount(),
        currentPageIndex: 0,
        isDirty: false,
        formFields: listFormFields(pdfLibDoc),
        undoStack: [],
        redoStack: [],
        draftOverlays: [],
      });
    } catch (err) {
      set({ errorMessage: (err as Error).message });
    } finally {
      set({ isBusy: false });
    }
  },

  newBlankDocument: async () => {
    const pdfLibDoc = await createBlankDocument();
    pdfLibDoc.addPage();
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({
      fileName: "Sans titre.pdf",
      pdfLibDoc,
      pdfJsDoc,
      pageCount,
      currentPageIndex: 0,
      isDirty: true,
      formFields: [],
      undoStack: [],
      redoStack: [],
      draftOverlays: [],
    });
  },

  setActiveTool: (tool) => {
    set({ activeTool: tool });
    void get().commitAllDraftOverlays();
  },
  setCurrentPage: (index) => {
    set({ currentPageIndex: index });
    void get().commitAllDraftOverlays();
  },
  setZoom: (zoom) => set({ zoom: Math.min(Math.max(zoom, 0.3), 4) }),

  rotateCurrentPage: async (delta) => {
    const { pdfLibDoc, currentPageIndex } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    engineRotatePage(pdfLibDoc, currentPageIndex, delta);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  deletePage: async (pageIndex) => {
    const { pdfLibDoc, currentPageIndex } = get();
    if (!pdfLibDoc || pdfLibDoc.getPageCount() <= 1) return;
    await pushUndoSnapshot(get, set);
    engineDeletePage(pdfLibDoc, pageIndex);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({
      pdfJsDoc,
      pageCount,
      isDirty: true,
      currentPageIndex: Math.min(currentPageIndex, pageCount - 1),
    });
  },

  movePage: async (fromIndex, toIndex) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    const order = pdfLibDoc.getPageIndices();
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    const rebuilt = await engineReorderPages(pdfLibDoc, order);
    const { pdfJsDoc, pageCount } = await resync(rebuilt);
    set({ pdfLibDoc: rebuilt, pdfJsDoc, pageCount, isDirty: true });
  },

  addImagesAsPages: async (images) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    for (const imageBytes of images) {
      await appendImageAsPage(pdfLibDoc, imageBytes);
    }
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  mergePdfBytes: async (bytes) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    await mergeDocumentInto(pdfLibDoc, bytes);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  splitCurrentPageOut: async (pageIndex) => {
    await get().commitAllDraftOverlays();
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) throw new Error("Aucun document ouvert.");
    const extracted = await extractPagesAsNewDocument(pdfLibDoc, [pageIndex]);
    return saveToBytes(extracted);
  },

  addTextAt: async (pageIndex, xRatio, yRatio, text, fontSize, colorHex) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    await drawTextOverlay(pdfLibDoc, { pageIndex, xRatio, yRatio, text, fontSize, colorHex });
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  addImageAt: async (pageIndex, xRatio, yRatio, widthRatio, heightRatio, imageBytes) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    await drawImageOverlay(pdfLibDoc, { pageIndex, xRatio, yRatio, widthRatio, heightRatio, imageBytes });
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  addDraftText: (pageIndex, xRatio, yRatio) => {
    const id = crypto.randomUUID();
    const draft: DraftOverlay = {
      id,
      pageIndex,
      kind: "text",
      xRatio,
      yRatio,
      fontSize: 16,
      colorHex: "#111111",
      text: "",
    };
    set((state) => ({ draftOverlays: [...state.draftOverlays, draft] }));
    return id;
  },

  addDraftImage: async (pageIndex, xRatio, yRatio, imageBytes) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return "";
    const format = detectImageFormat(imageBytes);
    const previewUrl = arrayBufferToDataUrl(imageBytes, format === "png" ? "image/png" : "image/jpeg");

    // Default to a sensible on-page width, then derive height from the image's own
    // aspect ratio so it doesn't appear stretched before the user resizes it.
    const widthRatio = 0.3;
    let heightRatio = 0.3;
    try {
      const { width: pageWidth, height: pageHeight } = pdfLibDoc.getPage(pageIndex).getSize();
      const natural = await loadImageNaturalSize(previewUrl);
      heightRatio = (widthRatio * pageWidth * natural.height) / (pageHeight * natural.width);
    } catch {
      // Fall back to the square default above if dimensions can't be read.
    }

    const id = crypto.randomUUID();
    const draft: DraftOverlay = {
      id,
      pageIndex,
      kind: "image",
      xRatio,
      yRatio,
      widthRatio,
      heightRatio,
      imageBytes,
      previewUrl,
    };
    set((state) => ({ draftOverlays: [...state.draftOverlays, draft] }));
    return id;
  },

  updateDraftOverlay: (id, patch) => {
    set((state) => ({
      draftOverlays: state.draftOverlays.map((overlay) =>
        overlay.id === id ? ({ ...overlay, ...patch } as DraftOverlay) : overlay
      ),
    }));
  },

  removeDraftOverlay: (id) => {
    set((state) => ({ draftOverlays: state.draftOverlays.filter((overlay) => overlay.id !== id) }));
  },

  commitDraftOverlay: async (id) => {
    const overlay = get().draftOverlays.find((o) => o.id === id);
    if (!overlay) return;
    if (overlay.kind === "text") {
      if (overlay.text.trim().length > 0) {
        await get().addTextAt(overlay.pageIndex, overlay.xRatio, overlay.yRatio, overlay.text, overlay.fontSize, overlay.colorHex);
      }
    } else {
      await get().addImageAt(overlay.pageIndex, overlay.xRatio, overlay.yRatio, overlay.widthRatio, overlay.heightRatio, overlay.imageBytes);
    }
    set((state) => ({ draftOverlays: state.draftOverlays.filter((o) => o.id !== id) }));
  },

  commitAllDraftOverlays: async () => {
    for (const overlay of get().draftOverlays) {
      await get().commitDraftOverlay(overlay.id);
    }
  },

  refreshFormFields: () => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    set({ formFields: listFormFields(pdfLibDoc) });
  },

  // No undo snapshot here: this fires on every keystroke, and snapshotting per
  // character would make undo useless. Structural edits (pages, overlays, flatten)
  // remain undoable; retyping a field is the "undo" for form filling.
  updateFormFieldValue: async (field, value) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    engineSetFormFieldValue(pdfLibDoc, field, value);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({
      pdfJsDoc,
      pageCount,
      isDirty: true,
      formFields: get().formFields.map((f) => (f.name === field.name ? { ...f, value } : f)),
    });
  },

  flattenForm: async () => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await pushUndoSnapshot(get, set);
    engineFlattenForm(pdfLibDoc);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true, formFields: [] });
  },

  setLastSignature: (dataUrl) => set({ lastSignatureDataUrl: dataUrl }),

  undo: async () => {
    const { pdfLibDoc, undoStack } = get();
    if (!pdfLibDoc || undoStack.length === 0) return;
    const currentBytes = await saveToBytes(pdfLibDoc);
    const previousBytes = undoStack[undoStack.length - 1];
    const { pdfLibDoc: restoredDoc, pdfJsDoc } = await loadPdf(previousBytes);
    set((state) => ({
      pdfLibDoc: restoredDoc,
      pdfJsDoc,
      pageCount: restoredDoc.getPageCount(),
      currentPageIndex: Math.min(state.currentPageIndex, restoredDoc.getPageCount() - 1),
      formFields: listFormFields(restoredDoc),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, currentBytes].slice(-MAX_HISTORY),
      isDirty: true,
    }));
  },

  redo: async () => {
    const { pdfLibDoc, redoStack } = get();
    if (!pdfLibDoc || redoStack.length === 0) return;
    const currentBytes = await saveToBytes(pdfLibDoc);
    const nextBytes = redoStack[redoStack.length - 1];
    const { pdfLibDoc: restoredDoc, pdfJsDoc } = await loadPdf(nextBytes);
    set((state) => ({
      pdfLibDoc: restoredDoc,
      pdfJsDoc,
      pageCount: restoredDoc.getPageCount(),
      currentPageIndex: Math.min(state.currentPageIndex, restoredDoc.getPageCount() - 1),
      formFields: listFormFields(restoredDoc),
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, currentBytes].slice(-MAX_HISTORY),
      isDirty: true,
    }));
  },

  exportBytes: async () => {
    await get().commitAllDraftOverlays();
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) throw new Error("Aucun document ouvert.");
    return saveToBytes(pdfLibDoc);
  },
}));
