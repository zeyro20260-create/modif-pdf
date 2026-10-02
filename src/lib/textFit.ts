import type { TextFontStyle } from "@/features/document/documentTypes";
import { catalogFontById } from "./fontCatalog";

let ctx: CanvasRenderingContext2D | null = null;

/** Width in points of `text` set in a catalog font at `sizePt`, measured with the same TrueType face. */
export function measureTextWidthPt(
  text: string,
  fontId: string,
  style: Pick<TextFontStyle, "bold" | "italic">,
  sizePt: number
): number {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * sizePt * 0.5;
  ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}100px ${catalogFontById(fontId).css}`;
  return (ctx.measureText(text).width / 100) * sizePt;
}
