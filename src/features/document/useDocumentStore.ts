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
import type { ToolId, FormFieldState } from "./documentTypes";

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

  refreshFormFields: () => void;
  updateFormFieldValue: (field: FormFieldState, value: string) => Promise<void>;
  flattenForm: () => Promise<void>;

  setLastSignature: (dataUrl: string) => void;

  exportBytes: () => Promise<ArrayBuffer>;
}

async function resync(pdfLibDoc: PDFDocument) {
  const pdfJsDoc = await resyncPdfJs(pdfLibDoc);
  return { pdfJsDoc, pageCount: pdfLibDoc.getPageCount() };
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
    });
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setCurrentPage: (index) => set({ currentPageIndex: index }),
  setZoom: (zoom) => set({ zoom: Math.min(Math.max(zoom, 0.3), 4) }),

  rotateCurrentPage: async (delta) => {
    const { pdfLibDoc, currentPageIndex } = get();
    if (!pdfLibDoc) return;
    engineRotatePage(pdfLibDoc, currentPageIndex, delta);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  deletePage: async (pageIndex) => {
    const { pdfLibDoc, currentPageIndex } = get();
    if (!pdfLibDoc || pdfLibDoc.getPageCount() <= 1) return;
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
    for (const imageBytes of images) {
      await appendImageAsPage(pdfLibDoc, imageBytes);
    }
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  mergePdfBytes: async (bytes) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await mergeDocumentInto(pdfLibDoc, bytes);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  splitCurrentPageOut: async (pageIndex) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) throw new Error("Aucun document ouvert.");
    const extracted = await extractPagesAsNewDocument(pdfLibDoc, [pageIndex]);
    return saveToBytes(extracted);
  },

  addTextAt: async (pageIndex, xRatio, yRatio, text, fontSize, colorHex) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await drawTextOverlay(pdfLibDoc, { pageIndex, xRatio, yRatio, text, fontSize, colorHex });
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  addImageAt: async (pageIndex, xRatio, yRatio, widthRatio, heightRatio, imageBytes) => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    await drawImageOverlay(pdfLibDoc, { pageIndex, xRatio, yRatio, widthRatio, heightRatio, imageBytes });
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true });
  },

  refreshFormFields: () => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) return;
    set({ formFields: listFormFields(pdfLibDoc) });
  },

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
    engineFlattenForm(pdfLibDoc);
    const { pdfJsDoc, pageCount } = await resync(pdfLibDoc);
    set({ pdfJsDoc, pageCount, isDirty: true, formFields: [] });
  },

  setLastSignature: (dataUrl) => set({ lastSignatureDataUrl: dataUrl }),

  exportBytes: async () => {
    const { pdfLibDoc } = get();
    if (!pdfLibDoc) throw new Error("Aucun document ouvert.");
    return saveToBytes(pdfLibDoc);
  },
}));
