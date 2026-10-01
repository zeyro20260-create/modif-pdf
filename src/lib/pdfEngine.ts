import { PDFDocument, rgb, degrees, PDFFont, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
// Vite-specific "?url" import gives us the worker's final built URL.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { FormFieldState } from "@/features/document/documentTypes";
import { detectImageFormat, type ImageFormat } from "./imageFormat";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LoadedDocument {
  pdfLibDoc: PDFDocument;
  pdfJsDoc: pdfjsLib.PDFDocumentProxy;
}

export async function loadPdf(bytes: ArrayBuffer): Promise<LoadedDocument> {
  const [pdfLibDoc, pdfJsDoc] = await Promise.all([
    PDFDocument.load(bytes, { ignoreEncryption: true }),
    pdfjsLib.getDocument({ data: bytes.slice(0) }).promise,
  ]);
  return { pdfLibDoc, pdfJsDoc };
}

export async function createBlankDocument(): Promise<PDFDocument> {
  return PDFDocument.create();
}

/**
 * pdf-lib and pdf.js each keep their own independent in-memory model of the
 * document. After any mutation through pdf-lib we re-serialize and reload a
 * fresh pdf.js document so the on-screen render always matches the editable
 * document. Simpler and far less error-prone than keeping two object graphs
 * in sync by hand; for a personal-use tool the re-encode cost is a non-issue.
 */
export async function resyncPdfJs(pdfLibDoc: PDFDocument): Promise<pdfjsLib.PDFDocumentProxy> {
  const bytes = await pdfLibDoc.save();
  return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
}

export async function renderPageToCanvas(
  pdfJsDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const page = await pdfJsDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible d'obtenir le contexte 2D du canvas.");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;
}

export function rotatePage(pdfLibDoc: PDFDocument, pageIndex: number, deltaDegrees: 90 | -90): void {
  const page = pdfLibDoc.getPage(pageIndex);
  const current = page.getRotation().angle;
  const next = ((current + deltaDegrees) % 360 + 360) % 360;
  page.setRotation(degrees(next));
}

export function deletePage(pdfLibDoc: PDFDocument, pageIndex: number): void {
  pdfLibDoc.removePage(pageIndex);
}

/** Rebuilds the document with pages in `newOrder` (array of current page indices). */
export async function reorderPages(pdfLibDoc: PDFDocument, newOrder: number[]): Promise<PDFDocument> {
  const rebuilt = await PDFDocument.create();
  const copied = await rebuilt.copyPages(pdfLibDoc, newOrder);
  copied.forEach((page) => rebuilt.addPage(page));
  return rebuilt;
}

export async function extractPagesAsNewDocument(
  pdfLibDoc: PDFDocument,
  indices: number[]
): Promise<PDFDocument> {
  const extracted = await PDFDocument.create();
  const copied = await extracted.copyPages(pdfLibDoc, indices);
  copied.forEach((page) => extracted.addPage(page));
  return extracted;
}

export async function mergeDocumentInto(pdfLibDoc: PDFDocument, otherBytes: ArrayBuffer): Promise<void> {
  const other = await PDFDocument.load(otherBytes, { ignoreEncryption: true });
  const indices = other.getPageIndices();
  const copied = await pdfLibDoc.copyPages(other, indices);
  copied.forEach((page) => pdfLibDoc.addPage(page));
}

export async function appendImageAsPage(pdfLibDoc: PDFDocument, imageBytes: ArrayBuffer): Promise<void> {
  const format = detectImageFormat(imageBytes);
  const image = format === "png" ? await pdfLibDoc.embedPng(imageBytes) : await pdfLibDoc.embedJpg(imageBytes);
  const page = pdfLibDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
}

export interface TextOverlayOptions {
  pageIndex: number;
  /** Normalized 0..1, origin top-left (matches on-screen editing coordinates). */
  xRatio: number;
  yRatio: number;
  fontSize: number;
  colorHex: string;
  text: string;
}

let cachedFont: PDFFont | null = null;
let cachedFontDoc: PDFDocument | null = null;

async function getFont(pdfLibDoc: PDFDocument): Promise<PDFFont> {
  if (cachedFontDoc === pdfLibDoc && cachedFont) return cachedFont;
  cachedFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
  cachedFontDoc = pdfLibDoc;
  return cachedFont;
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

export async function drawTextOverlay(pdfLibDoc: PDFDocument, opts: TextOverlayOptions): Promise<void> {
  const page = pdfLibDoc.getPage(opts.pageIndex);
  const { width, height } = page.getSize();
  const font = await getFont(pdfLibDoc);
  const { r, g, b } = hexToRgb01(opts.colorHex);

  page.drawText(opts.text, {
    x: opts.xRatio * width,
    y: height - opts.yRatio * height - opts.fontSize,
    size: opts.fontSize,
    font,
    color: rgb(r, g, b),
  });
}

export interface ImageOverlayOptions {
  pageIndex: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  imageBytes: ArrayBuffer;
}

export async function drawImageOverlay(pdfLibDoc: PDFDocument, opts: ImageOverlayOptions): Promise<void> {
  const page = pdfLibDoc.getPage(opts.pageIndex);
  const { width, height } = page.getSize();
  const format: ImageFormat = detectImageFormat(opts.imageBytes);
  const image = format === "png" ? await pdfLibDoc.embedPng(opts.imageBytes) : await pdfLibDoc.embedJpg(opts.imageBytes);

  const drawWidth = opts.widthRatio * width;
  const drawHeight = opts.heightRatio * height;

  page.drawImage(image, {
    x: opts.xRatio * width,
    y: height - opts.yRatio * height - drawHeight,
    width: drawWidth,
    height: drawHeight,
  });
}

export function listFormFields(pdfLibDoc: PDFDocument): FormFieldState[] {
  const form = pdfLibDoc.getForm();
  return form.getFields().map((field) => {
    const name = field.getName();
    const constructorName = field.constructor.name;

    if (constructorName === "PDFTextField") {
      const textField = form.getTextField(name);
      return { name, type: "text", value: textField.getText() ?? "" };
    }
    if (constructorName === "PDFCheckBox") {
      const checkBox = form.getCheckBox(name);
      return { name, type: "checkbox", value: checkBox.isChecked() ? "true" : "false" };
    }
    if (constructorName === "PDFRadioGroup") {
      const radioGroup = form.getRadioGroup(name);
      return { name, type: "radio", value: radioGroup.getSelected() ?? "", options: radioGroup.getOptions() };
    }
    if (constructorName === "PDFDropdown") {
      const dropdown = form.getDropdown(name);
      return { name, type: "dropdown", value: dropdown.getSelected()[0] ?? "", options: dropdown.getOptions() };
    }
    return { name, type: "unsupported", value: "" };
  });
}

export function setFormFieldValue(pdfLibDoc: PDFDocument, field: FormFieldState, value: string): void {
  const form = pdfLibDoc.getForm();
  switch (field.type) {
    case "text":
      form.getTextField(field.name).setText(value);
      return;
    case "checkbox": {
      const box = form.getCheckBox(field.name);
      if (value === "true") box.check();
      else box.uncheck();
      return;
    }
    case "radio":
      form.getRadioGroup(field.name).select(value);
      return;
    case "dropdown":
      form.getDropdown(field.name).select(value);
      return;
    default:
      return;
  }
}

export function flattenForm(pdfLibDoc: PDFDocument): void {
  pdfLibDoc.getForm().flatten();
}

export async function saveToBytes(pdfLibDoc: PDFDocument): Promise<ArrayBuffer> {
  const bytes = await pdfLibDoc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
