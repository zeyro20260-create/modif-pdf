import { useState } from "react";
import type { PageTextItem } from "@/features/document/documentTypes";

interface Props {
  item: PageTextItem;
  canvasWidthPx: number;
  canvasHeightPx: number;
  /** Called with the picked part of the run (a word on click, a character range on drag). */
  onPick: (picked: PageTextItem) => void;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Horizontal position of every caret stop in a run (n+1 values, 0..item.widthRatio). pdf.js only
 * reports the run's total width, so the split between characters is proportional to their widths
 * in the matching browser font, rescaled to the real width.
 */
function caretEdges(item: PageTextItem): number[] {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const { family, bold, italic } = item.fontStyle;
  const css = family === "serif" ? "Times New Roman, serif" : family === "mono" ? "Courier New, monospace" : "Arial, sans-serif";
  const n = item.str.length;
  const raw = [0];
  if (measureCtx) {
    measureCtx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}100px ${css}`;
    for (let i = 1; i <= n; i++) raw.push(measureCtx.measureText(item.str.slice(0, i)).width);
  } else {
    for (let i = 1; i <= n; i++) raw.push(i);
  }
  const total = raw[n] || 1;
  return raw.map((w) => (w / total) * item.widthRatio);
}

function nearestCaret(edges: number[], xRatioInRun: number): number {
  let best = 0;
  edges.forEach((e, i) => {
    if (Math.abs(e - xRatioInRun) < Math.abs(edges[best] - xRatioInRun)) best = i;
  });
  return best;
}

function charAt(edges: number[], xRatioInRun: number): number {
  let idx = 0;
  for (let i = 0; i < edges.length - 1; i++) if (edges[i] <= xRatioInRun) idx = i;
  return idx;
}

function slice(item: PageTextItem, edges: number[], a: number, b: number): PageTextItem {
  const n = item.str.length;
  return {
    ...item,
    str: item.str.slice(a, b),
    xRatio: item.xRatio + edges[a],
    widthRatio: edges[b] - edges[a],
    prefix: a > 0 ? { str: item.str.slice(0, a), xRatio: item.xRatio, widthRatio: edges[a] } : undefined,
    tail: b < n ? { str: item.str.slice(b), xRatio: item.xRatio + edges[b], widthRatio: item.widthRatio - edges[b] } : undefined,
  };
}

export function TextRunHit({ item, canvasWidthPx, canvasHeightPx, onPick }: Props) {
  const [range, setRange] = useState<{ edges: number[]; a: number; b: number } | null>(null);

  const left = item.xRatio * canvasWidthPx;
  const width = item.widthRatio * canvasWidthPx;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    const edges = caretEdges(item);
    const originLeft = e.currentTarget.getBoundingClientRect().left;
    const toRunRatio = (clientX: number) => (clientX - originLeft) / canvasWidthPx;

    const anchor = nearestCaret(edges, toRunRatio(e.clientX));
    const startX = e.clientX;
    let dragged = false;
    let focus = anchor;

    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 3) dragged = true;
      if (!dragged) return;
      focus = nearestCaret(edges, toRunRatio(ev.clientX));
      setRange({ edges, a: Math.min(anchor, focus), b: Math.max(anchor, focus) });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setRange(null);
      if (dragged) {
        const a = Math.min(anchor, focus);
        const b = Math.max(anchor, focus);
        if (b > a) onPick(slice(item, edges, a, b));
        return;
      }
      // Plain click: pick the word under the pointer.
      const at = charAt(edges, toRunRatio(ev.clientX));
      if (/\s/.test(item.str[at] ?? " ")) return;
      let a = at;
      let b = at + 1;
      while (a > 0 && !/\s/.test(item.str[a - 1])) a--;
      while (b < item.str.length && !/\s/.test(item.str[b])) b++;
      onPick(slice(item, edges, a, b));
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      className="text-hit"
      title="Clic : mot — glisser : sélection"
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left,
        top: item.yRatio * canvasHeightPx,
        width,
        height: item.heightRatio * canvasHeightPx,
        cursor: "text",
        zIndex: 2,
        userSelect: "none",
      }}
    >
      {range && (
        <div
          style={{
            position: "absolute",
            left: range.edges[range.a] * canvasWidthPx,
            width: (range.edges[range.b] - range.edges[range.a]) * canvasWidthPx,
            top: 0,
            bottom: 0,
            background: "rgba(79, 140, 255, 0.35)",
          }}
        />
      )}
    </div>
  );
}
