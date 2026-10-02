import { PDFDict, PDFDocument, PDFHexString, PDFName, rgb, degrees, PDFFont, PDFPage, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pdfjsLib from "pdfjs-dist";
// Vite-specific "?url" import gives us the worker's final built URL.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { FormFieldState, PageTextItem, RunPart, TextFontStyle, TextReplacement } from "@/features/document/documentTypes";
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

const renderTasks = new WeakMap<HTMLCanvasElement, pdfjsLib.RenderTask>();

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

  // pdf.js refuses two concurrent renders on one canvas (React StrictMode / fast zoom changes
  // trigger exactly that), so the previous render is cancelled before starting the new one.
  renderTasks.get(canvas)?.cancel();

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const task = page.render({ canvasContext: context, viewport });
  renderTasks.set(canvas, task);
  await task.promise;
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
  fontStyle?: TextFontStyle;
  /** A TrueType font to embed; `key` identifies it so it is embedded once per document. */
  fontFile?: { key: string; bytes: ArrayBuffer };
  /** Text further right on the line; pushed right only as far as needed to stay clear of the new text. */
  neighbors?: Array<{
    part: RunPart & { bgHex: string; colorHex: string };
    fontSize: number;
    fontStyle: TextFontStyle;
    fontFile?: { key: string; bytes: ArrayBuffer };
  }>;
  /** Font for the untouched rest of the line, when it differs from the one chosen for the new text. */
  restFont?: { fontFile?: { key: string; bytes: ArrayBuffer } };
  /** Number of text runs on the page before this edit (see recordCovers). */
  runsBefore?: number;
  /** When set, the original text is painted over with its background and the new text sits on its baseline. */
  replace?: TextReplacement;
}

const fontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

function standardFontFor(style: TextFontStyle): StandardFonts {
  const { family, bold, italic } = style;
  if (family === "serif") {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (family === "mono") {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

async function getFont(
  pdfLibDoc: PDFDocument,
  style: TextFontStyle,
  fontFile?: { key: string; bytes: ArrayBuffer }
): Promise<PDFFont> {
  let perDoc = fontCache.get(pdfLibDoc);
  if (!perDoc) {
    perDoc = new Map();
    fontCache.set(pdfLibDoc, perDoc);
  }
  if (fontFile) {
    // Embedded fresh on every call, never cached: pdf-lib freezes a subset font's glyph set the
    // first time the document is saved, so reusing it later would drop the new characters.
    try {
      pdfLibDoc.registerFontkit(fontkit);
      return await pdfLibDoc.embedFont(fontFile.bytes, { subset: true });
    } catch {
      // Unreadable font file: fall back to the closest built-in PDF font below.
    }
  }
  const standard = standardFontFor(style);
  let font = perDoc.get(standard);
  if (!font) {
    font = await pdfLibDoc.embedFont(standard);
    perDoc.set(standard, font);
  }
  return font;
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/** Standard PDF fonts only cover WinAnsi; swap anything else for "?" rather than failing the save. */
function toEncodable(font: PDFFont, text: string): string {
  return Array.from(text)
    .map((ch) => {
      try {
        font.widthOfTextAtSize(ch, 10);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
}

/**
 * The visible page area in PDF user space. Pages whose MediaBox/CropBox does not start at (0,0)
 * would otherwise get overlays drawn shifted away from where they were placed on screen.
 */
function pageBox(page: PDFPage) {
  const { x, y, width, height } = page.getCropBox();
  return { x, y, width, height };
}

/**
 * Starts a fresh content stream for the next drawing operations. pdf-lib compresses a page's
 * current stream the first time the document is saved and then keeps serving that cached result,
 * so anything appended to the same stream afterwards is silently lost on later saves. The editor
 * saves after every edit, hence one new stream per drawing.
 */
function beginDrawing(page: PDFPage) {
  // getContentStream is private in pdf-lib's typings but is the only way to force a new stream.
  (page as unknown as { getContentStream: (useExisting: boolean) => unknown }).getContentStream(false);
}

export async function drawTextOverlay(pdfLibDoc: PDFDocument, opts: TextOverlayOptions): Promise<void> {
  const page = pdfLibDoc.getPage(opts.pageIndex);
  const { x: originX, y: originY, width, height } = pageBox(page);
  beginDrawing(page);
  const font = await getFont(pdfLibDoc, opts.fontStyle ?? { family: "sans", bold: false, italic: false }, opts.fontFile);
  const { r, g, b } = hexToRgb01(opts.colorHex);
  const rep = opts.replace;

  let baselineY = originY + height - opts.yRatio * height - opts.fontSize;

  if (rep) {
    const pad = 1;
    const cover = (xRatio: number, widthRatio: number, bgHex: string) => {
      const bg = hexToRgb01(bgHex);
      page.drawRectangle({
        x: originX + xRatio * width - pad,
        y: originY + height - (opts.yRatio + rep.heightRatio) * height,
        width: widthRatio * width + pad * 2,
        height: rep.heightRatio * height,
        color: rgb(bg.r, bg.g, bg.b),
      });
    };
    baselineY = originY + height - rep.baselineRatio * height;

    const restFont = opts.restFont ? await getFont(pdfLibDoc, rep.originalStyle, opts.restFont.fontFile) : font;
    const encodedNew = toEncodable(font, opts.text);
    const restWidth = (str: string) => restFont.widthOfTextAtSize(toEncodable(restFont, str), rep.originalFontSize);

    // The line is laid out again from the real glyph widths: prefix, new text and tail follow each
    // other exactly. Shifting the tail by an estimated difference would leave gaps or overlaps
    // whenever the replacement font's widths differ even slightly from the original's.
    const startX = originX + (rep.prefix ? rep.prefix.xRatio : opts.xRatio) * width;
    const newX = startX + (rep.prefix ? restWidth(rep.prefix.str) : 0);
    const newW = encodedNew.length > 0 ? font.widthOfTextAtSize(encodedNew, opts.fontSize) : 0;
    const tailX = newX + newW;
    const lineEnd = rep.tail ? tailX + restWidth(rep.tail.str) : tailX;
    const originalEnd = originX + (rep.tail ? rep.tail.xRatio + rep.tail.widthRatio : opts.xRatio + rep.widthRatio) * width;

    // Neighbouring text on the same line only moves if the line now runs into it, and then just
    // far enough to keep (at most one space of) the gap it had before.
    const pushed: Array<{ n: NonNullable<TextOverlayOptions["neighbors"]>[number]; x: number }> = [];
    let prevNewEnd = lineEnd;
    let prevOriginalEnd = originalEnd;
    for (const n of opts.neighbors ?? []) {
      const nx = originX + n.part.xRatio * width;
      const nw = n.part.widthRatio * width;
      const gap = Math.min(Math.max(nx - prevOriginalEnd, 0), 0.3 * n.fontSize);
      const push = Math.max(0, prevNewEnd + gap - nx);
      if (push <= 0) break;
      pushed.push({ n, x: nx + push });
      prevNewEnd = nx + push + nw;
      prevOriginalEnd = nx + nw;
    }

    // Everything is painted over first (so no cover can land on freshly drawn text), then redrawn.
    cover(opts.xRatio, rep.widthRatio, rep.bgHex);
    if (rep.prefix) cover(rep.prefix.xRatio, rep.prefix.widthRatio, rep.prefix.bgHex);
    if (rep.tail) cover(rep.tail.xRatio, rep.tail.widthRatio, rep.tail.bgHex);
    for (const { n } of pushed) cover(n.part.xRatio, n.part.widthRatio, n.part.bgHex);
    if (opts.runsBefore !== undefined) {
      const box = (xRatio: number, widthRatio: number) => ({
        p: opts.pageIndex,
        i: opts.runsBefore as number,
        x: xRatio,
        y: opts.yRatio,
        w: widthRatio,
        h: rep.heightRatio,
      });
      recordCovers(pdfLibDoc, [
        box(opts.xRatio, rep.widthRatio),
        ...(rep.prefix ? [box(rep.prefix.xRatio, rep.prefix.widthRatio)] : []),
        ...(rep.tail ? [box(rep.tail.xRatio, rep.tail.widthRatio)] : []),
        ...pushed.map(({ n }) => box(n.part.xRatio, n.part.widthRatio)),
      ]);
    }

    const drawRest = (part: RunPart & { colorHex: string }, x: number) => {
      const c = hexToRgb01(part.colorHex);
      page.drawText(toEncodable(restFont, part.str), {
        x,
        y: baselineY,
        size: rep.originalFontSize,
        font: restFont,
        color: rgb(c.r, c.g, c.b),
      });
    };
    if (rep.prefix) drawRest(rep.prefix, startX);
    if (encodedNew.length > 0) page.drawText(encodedNew, { x: newX, y: baselineY, size: opts.fontSize, font, color: rgb(r, g, b) });
    if (rep.tail) drawRest(rep.tail, tailX);
    for (const { n, x } of pushed) {
      const nFont = await getFont(pdfLibDoc, n.fontStyle, n.fontFile);
      const c = hexToRgb01(n.part.colorHex);
      page.drawText(toEncodable(nFont, n.part.str), { x, y: baselineY, size: n.fontSize, font: nFont, color: rgb(c.r, c.g, c.b) });
    }
    return;
  }

  if (opts.text.length === 0) return;
  page.drawText(toEncodable(font, opts.text), {
    x: originX + opts.xRatio * width,
    y: baselineY,
    size: opts.fontSize,
    font,
    color: rgb(r, g, b),
  });
}

/**
 * Covers painted over replaced text, remembered in the PDF's Info dictionary so they survive
 * saving, undo and reopening. The replaced text itself stays in the file under its cover; `i` is
 * how many text runs existed when the cover was painted, so only runs older than it count as hidden.
 */
interface CoverRecord {
  p: number;
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COVERS_KEY = "ModifPdfCovers";

function recordCovers(pdfLibDoc: PDFDocument, added: CoverRecord[]): void {
  // getInfoDict is private in pdf-lib's typings; it returns (creating if needed) the Info dictionary.
  const info = (pdfLibDoc as unknown as { getInfoDict: () => PDFDict }).getInfoDict();
  let existing: CoverRecord[] = [];
  try {
    const current = info.get(PDFName.of(COVERS_KEY));
    const text = current && "decodeText" in current ? (current as PDFHexString).decodeText() : "";
    if (text) existing = JSON.parse(text) as CoverRecord[];
  } catch {
    existing = [];
  }
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const merged = [...existing, ...added.map((c) => ({ ...c, x: round(c.x), y: round(c.y), w: round(c.w), h: round(c.h) }))];
  info.set(PDFName.of(COVERS_KEY), PDFHexString.fromText(JSON.stringify(merged)));
}

async function readCovers(pdfJsDoc: pdfjsLib.PDFDocumentProxy): Promise<CoverRecord[]> {
  try {
    const { info } = await pdfJsDoc.getMetadata();
    const raw = (info as { Custom?: Record<string, unknown> }).Custom?.[COVERS_KEY];
    return typeof raw === "string" ? (JSON.parse(raw) as CoverRecord[]) : [];
  } catch {
    return [];
  }
}

interface RawRun {
  str: string;
  x: number;
  baseline: number;
  width: number;
  size: number;
  fontId: string;
}

/** Upright, non-blank text fragments of a page in drawing order, in scale-1 viewport coordinates. */
function rawRunsOf(content: Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>, viewport: pdfjsLib.PageViewport): RawRun[] {
  const raw: RawRun[] = [];
  for (const item of content.items) {
    // Whitespace-only items are spacers pdf.js inserts between chunks, sized to the whole gap;
    // merging them would stretch a run across its neighbours. The gap test later re-adds spaces.
    if (!("str" in item) || item.str.trim().length === 0) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 1 || Math.abs(tx[1]) > 0.01 * size) continue;
    raw.push({ str: item.str, x: tx[4], baseline: tx[5], width: item.width, size, fontId: item.fontName });
  }
  return raw;
}

/** How many text fragments the page currently holds; stored with a cover to tell old text from new. */
export async function countPageTextRuns(pdfJsDoc: pdfjsLib.PDFDocumentProxy, pageIndex: number): Promise<number> {
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  if (page.rotate % 360 !== 0) return 0;
  return rawRunsOf(await page.getTextContent(), page.getViewport({ scale: 1 })).length;
}

function detectFontStyle(realName: string, cssFamily: string): TextFontStyle {
  const name = realName.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(name);
  const italic = /italic|oblique/.test(name);
  let family: TextFontStyle["family"] = "sans";
  if (/courier|mono|consolas|typewriter/.test(name) || cssFamily === "monospace") family = "mono";
  else if (/times|serif|georgia|garamond|minion|palatino|cambria|bookman|century/.test(name) && !/sans/.test(name))
    family = "serif";
  else if (cssFamily === "serif" && !/arial|helvetica|calibri|verdana|tahoma|sans/.test(name)) family = "serif";
  return { family, bold, italic };
}

/**
 * Lists the existing text runs of a page, merging neighbouring pdf.js fragments that sit on the
 * same line with the same font so a whole phrase can be edited at once. Pages with a rotation and
 * rotated/vertical text are skipped: the overlay coordinate system here assumes upright pages.
 */
export async function getPageTextItems(
  pdfJsDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number
): Promise<PageTextItem[]> {
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  if (page.rotate % 360 !== 0) return [];
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  type Run = RawRun;
  const raw = rawRunsOf(content, viewport);

  // Text painted over by a replacement stays in the file under its cover: hide every fragment that
  // is mostly under a cover painted after it, so only the visible text can be picked.
  const covers = (await readCovers(pdfJsDoc)).filter((c) => c.p === pageIndex);
  const hiddenShare = (r: RawRun, index: number) => {
    const area = r.width * 1.15 * r.size;
    if (area <= 0) return 0;
    let covered = 0;
    for (const c of covers) {
      if (c.i <= index) continue;
      const cx = c.x * viewport.width;
      const cy = c.y * viewport.height;
      const w = Math.min(r.x + r.width, cx + c.w * viewport.width) - Math.max(r.x, cx);
      const h = Math.min(r.baseline + 0.25 * r.size, cy + c.h * viewport.height) - Math.max(r.baseline - 0.9 * r.size, cy);
      if (w > 0 && h > 0) covered += w * h;
    }
    return covered / area;
  };
  const visible = raw.filter((r, i) => hiddenShare(r, i) <= 0.5);

  // Merge neighbours on the same line by position, not drawing order: an edited line is drawn as
  // several pieces out of left-to-right order but must be pickable (and shift) as one line again.
  visible.sort((a, b) => a.baseline - b.baseline);
  const lines: Run[][] = [];
  for (const r of visible) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].baseline - r.baseline) < 0.5) line.push(r);
    else lines.push([r]);
  }
  const runs: Run[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let prev: Run | null = null;
    for (const run of line) {
      if (prev && prev.fontId === run.fontId && Math.abs(prev.size - run.size) < 0.1) {
        const gap = run.x - (prev.x + prev.width);
        if (gap > -1 && gap < 0.6 * run.size) {
          const needsSpace = gap > 0.15 * run.size && !prev.str.endsWith(" ") && !run.str.startsWith(" ");
          prev.str += (needsSpace ? " " : "") + run.str;
          prev.width = run.x + run.width - prev.x;
          continue;
        }
      }
      prev = { ...run };
      runs.push(prev);
    }
  }

  const styleCache = new Map<string, { style: TextFontStyle; realName: string }>();
  function styleFor(fontId: string) {
    const cached = styleCache.get(fontId);
    if (cached) return cached;
    let realName = "";
    try {
      realName = (page.commonObjs.get(fontId) as { name?: string } | null)?.name ?? "";
    } catch {
      // Font object not resolved yet; fall back to the CSS family hint below.
    }
    const entry = { style: detectFontStyle(realName, content.styles[fontId]?.fontFamily ?? ""), realName };
    styleCache.set(fontId, entry);
    return entry;
  }

  const items = runs
    .filter((r) => r.str.trim().length > 0)
    .map((r) => {
      const top = r.baseline - 0.9 * r.size;
      const { style, realName } = styleFor(r.fontId);
      return {
        str: r.str,
        xRatio: r.x / viewport.width,
        yRatio: top / viewport.height,
        widthRatio: r.width / viewport.width,
        heightRatio: (1.15 * r.size) / viewport.height,
        baselineRatio: r.baseline / viewport.height,
        fontSizePt: r.size,
        fontStyle: style,
        fontName: realName,
      };
    });

  return items;
}

/** Picks the page background (most common colour) and the ink colour (furthest from it) inside a canvas rectangle. */
export function sampleTextColors(
  canvas: HTMLCanvasElement,
  box: { xRatio: number; yRatio: number; widthRatio: number; heightRatio: number }
): { bgHex: string; fgHex: string } {
  const fallback = { bgHex: "#ffffff", fgHex: "#111111" };
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  const x = Math.max(0, Math.floor(box.xRatio * canvas.width));
  const y = Math.max(0, Math.floor(box.yRatio * canvas.height));
  const w = Math.min(canvas.width - x, Math.ceil(box.widthRatio * canvas.width));
  const h = Math.min(canvas.height - y, Math.ceil(box.heightRatio * canvas.height));
  if (w <= 0 || h <= 0) return fallback;
  const data = ctx.getImageData(x, y, w, h).data;

  const bucket = (i: number) => ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = bucket(i);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey = 0;
  let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  });
  // Use an actual pixel of the winning bucket so the background colour is exact, not quantized.
  let bg: [number, number, number] = [255, 255, 255];
  for (let i = 0; i < data.length; i += 4) {
    if (bucket(i) === bestKey) {
      bg = [data[i], data[i + 1], data[i + 2]];
      break;
    }
  }
  let fg: [number, number, number] = [17, 17, 17];
  let maxDist = -1;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (d > maxDist) {
      maxDist = d;
      fg = [data[i], data[i + 1], data[i + 2]];
    }
  }
  const hex = (c: [number, number, number]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  return { bgHex: hex(bg), fgHex: maxDist < 60 ? "#111111" : hex(fg) };
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
  const { x: originX, y: originY, width, height } = pageBox(page);
  beginDrawing(page);
  const format: ImageFormat = detectImageFormat(opts.imageBytes);
  const image = format === "png" ? await pdfLibDoc.embedPng(opts.imageBytes) : await pdfLibDoc.embedJpg(opts.imageBytes);

  const drawWidth = opts.widthRatio * width;
  const drawHeight = opts.heightRatio * height;

  page.drawImage(image, {
    x: originX + opts.xRatio * width,
    y: originY + height - opts.yRatio * height - drawHeight,
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
