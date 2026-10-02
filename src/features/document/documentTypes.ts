export interface TextFontStyle {
  family: "sans" | "serif" | "mono";
  bold: boolean;
  italic: boolean;
}

/** A horizontal slice of a text run (the untouched text before or after an edited selection). */
export interface RunPart {
  str: string;
  xRatio: number;
  widthRatio: number;
}

/** A run of existing text found on a page (all positions normalized 0..1, origin top-left). */
export interface PageTextItem {
  str: string;
  xRatio: number;
  /** Top of the box covering the glyphs (ascent + descent), not the baseline. */
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  baselineRatio: number;
  fontSizePt: number;
  fontStyle: TextFontStyle;
  /** Real name of the original font (e.g. "ArialMT"), used to pick the closest Windows font. */
  fontName: string;
  /** Set when this item is only part of a run: the text left before / after it on the same line. */
  prefix?: RunPart;
  tail?: RunPart;
  /** Other text runs further right on the same line, pushed along if the new text grows into them. */
  neighbors?: PageTextItem[];
}

/** Set on a text draft that replaces existing page text instead of adding new text. */
export interface TextReplacement {
  widthRatio: number;
  heightRatio: number;
  baselineRatio: number;
  bgHex: string;
  originalText: string;
  originalFontSize: number;
  originalColorHex: string;
  originalFontId: string;
  originalStyle: TextFontStyle;
  /** Rest of the line around the selection: redrawn so the tail can move when the new text is longer/shorter. */
  prefix?: RunPart & { bgHex: string; colorHex: string };
  tail?: RunPart & { bgHex: string; colorHex: string };
  neighbors?: Array<{
    str: string;
    xRatio: number;
    widthRatio: number;
    fontSizePt: number;
    fontStyle: TextFontStyle;
    fontId: string;
    bgHex: string;
    colorHex: string;
  }>;
}

export type ToolId = "select" | "text" | "image" | "signature" | "organize" | "forms";

/**
 * An overlay the user is still positioning/editing on screen. Nothing is written
 * into the PDF until it's committed (see useDocumentStore.commitDraftOverlay) — this
 * is what lets text/images/signatures be dragged and resized before they're baked in.
 */
export type DraftOverlay =
  | {
      id: string;
      pageIndex: number;
      kind: "text";
      xRatio: number;
      yRatio: number;
      fontSize: number;
      colorHex: string;
      text: string;
      fontStyle: TextFontStyle;
      /** Id of a font from fontCatalog.ts. */
      fontId: string;
      replace?: TextReplacement;
    }
  | {
      id: string;
      pageIndex: number;
      kind: "image";
      xRatio: number;
      yRatio: number;
      widthRatio: number;
      heightRatio: number;
      imageBytes: ArrayBuffer;
      previewUrl: string;
    };

export interface FormFieldState {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "unsupported";
  value: string;
  options?: string[];
}
