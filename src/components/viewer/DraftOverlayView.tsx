import { useDocumentStore } from "@/features/document/useDocumentStore";
import type { DraftOverlay } from "@/features/document/documentTypes";
import { catalogFontById } from "@/lib/fontCatalog";
import { measureTextWidthPt } from "@/lib/textFit";

interface Props {
  overlay: DraftOverlay;
  canvasWidthPx: number;
  canvasHeightPx: number;
  selected: boolean;
  onSelect: () => void;
}

/** Tracks a pointer drag on `window` and reports normalized deltas until pointerup. */
function trackDrag(
  startEvent: React.PointerEvent,
  canvasWidthPx: number,
  canvasHeightPx: number,
  onDelta: (dxRatio: number, dyRatio: number) => void
) {
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;

  function onMove(ev: PointerEvent) {
    onDelta((ev.clientX - startX) / canvasWidthPx, (ev.clientY - startY) / canvasHeightPx);
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

export function DraftOverlayView({ overlay, canvasWidthPx, canvasHeightPx, selected, onSelect }: Props) {
  const updateDraftOverlay = useDocumentStore((s) => s.updateDraftOverlay);
  const removeDraftOverlay = useDocumentStore((s) => s.removeDraftOverlay);
  const commitDraftOverlay = useDocumentStore((s) => s.commitDraftOverlay);

  const zoom = useDocumentStore((s) => s.zoom);

  const leftPx = overlay.xRatio * canvasWidthPx;
  const topPx = overlay.yRatio * canvasHeightPx;

  function startMove(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const startXRatio = overlay.xRatio;
    const startYRatio = overlay.yRatio;
    trackDrag(e, canvasWidthPx, canvasHeightPx, (dx, dy) => {
      updateDraftOverlay(overlay.id, { xRatio: startXRatio + dx, yRatio: startYRatio + dy });
    });
  }

  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (overlay.kind !== "image") return;
    const startWidthRatio = overlay.widthRatio;
    const startHeightRatio = overlay.heightRatio;
    trackDrag(e, canvasWidthPx, canvasHeightPx, (dx, dy) => {
      updateDraftOverlay(overlay.id, {
        widthRatio: Math.max(0.03, startWidthRatio + dx),
        heightRatio: Math.max(0.03, startHeightRatio + dy),
      });
    });
  }

  // Text drafts are tuned from the right-hand panel: a floating bar would hide the page text being edited.
  const toolbar = selected && overlay.kind === "image" && (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: -32,
        left: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: 4,
        whiteSpace: "nowrap",
        zIndex: 20,
      }}
    >
      <button onClick={() => commitDraftOverlay(overlay.id)} title="Valider">
        ✓
      </button>
      <button onClick={() => removeDraftOverlay(overlay.id)} title="Annuler">
        ✕
      </button>
    </div>
  );

  if (overlay.kind === "text" && overlay.replace) {
    const { replace, fontStyle } = overlay;
    const boxH = replace.heightRatio * canvasHeightPx;
    const toPx = (ratio: number) => ratio * canvasWidthPx;
    // Width of the new text vs the old one: the rest of the line follows the difference.
    const newWidthPt = measureTextWidthPt(overlay.text, overlay.fontId, fontStyle, overlay.fontSize);
    const oldWidthPt = measureTextWidthPt(replace.originalText, replace.originalFontId, replace.originalStyle, replace.originalFontSize);
    const shiftPx = replace.tail ? (newWidthPt - oldWidthPt) * zoom : 0;
    const originalCss = catalogFontById(replace.originalFontId).css;
    const rel = (xRatio: number) => toPx(xRatio - overlay.xRatio);

    // Neighbouring text is pushed only as far as the line now reaches into it (same rule as on commit).
    const tailEndPx = replace.tail ? rel(replace.tail.xRatio) + shiftPx + toPx(replace.tail.widthRatio) : newWidthPt * zoom;
    const pushedNeighbors: Array<{ n: NonNullable<typeof replace.neighbors>[number]; push: number }> = [];
    {
      let prevNewEnd = Math.max(tailEndPx, newWidthPt * zoom);
      let prevOriginalEnd = rel(replace.tail ? replace.tail.xRatio + replace.tail.widthRatio : overlay.xRatio + replace.widthRatio);
      for (const n of replace.neighbors ?? []) {
        const nx = rel(n.xRatio);
        const gap = Math.min(Math.max(nx - prevOriginalEnd, 0), 0.3 * n.fontSizePt * zoom);
        const push = Math.max(0, prevNewEnd + gap - nx);
        if (push <= 0) break;
        pushedNeighbors.push({ n, push });
        prevNewEnd = nx + push + toPx(n.widthRatio);
        prevOriginalEnd = nx + toPx(n.widthRatio);
      }
    }

    // Layers, bottom to top: covers hiding the old glyphs, the moved tail, then the editor itself.
    return (
      <div
        style={{ position: "absolute", left: leftPx, top: topPx, zIndex: selected ? 15 : 5 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: "absolute", left: -1, top: 0, width: toPx(replace.widthRatio) + 2, height: boxH, background: replace.bgHex }} />
        {replace.tail && (
          <>
            <div
              style={{
                position: "absolute",
                left: rel(replace.tail.xRatio) - 1,
                top: 0,
                width: toPx(replace.tail.widthRatio) + 2,
                height: boxH,
                background: replace.tail.bgHex,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: rel(replace.tail.xRatio) + shiftPx,
                top: 0,
                height: boxH,
                lineHeight: `${boxH}px`,
                whiteSpace: "pre",
                pointerEvents: "none",
                color: replace.tail.colorHex,
                fontSize: replace.originalFontSize * zoom,
                fontFamily: originalCss,
                fontWeight: replace.originalStyle.bold ? "bold" : "normal",
                fontStyle: replace.originalStyle.italic ? "italic" : "normal",
              }}
            >
              {replace.tail.str}
            </div>
          </>
        )}
        {pushedNeighbors.map(({ n, push }, i) => (
          <div key={i}>
            <div style={{ position: "absolute", left: rel(n.xRatio) - 1, top: 0, width: toPx(n.widthRatio) + 2, height: boxH, background: n.bgHex }} />
            <div
              style={{
                position: "absolute",
                left: rel(n.xRatio) + push,
                top: 0,
                height: boxH,
                lineHeight: `${boxH}px`,
                whiteSpace: "pre",
                pointerEvents: "none",
                color: n.colorHex,
                fontSize: n.fontSizePt * zoom,
                fontFamily: catalogFontById(n.fontId).css,
                fontWeight: n.fontStyle.bold ? "bold" : "normal",
                fontStyle: n.fontStyle.italic ? "italic" : "normal",
              }}
            >
              {n.str}
            </div>
          </div>
        ))}
        <input
          autoFocus
          onFocus={(e) => {
            onSelect();
            e.currentTarget.select();
          }}
          value={overlay.text}
          onChange={(e) => updateDraftOverlay(overlay.id, { text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraftOverlay(overlay.id);
            if (e.key === "Escape") removeDraftOverlay(overlay.id);
          }}
          style={{
            position: "relative",
            display: "block",
            height: boxH,
            width: Math.max(newWidthPt * zoom + 4, 6),
            padding: 0,
            margin: 0,
            border: "none",
            outline: "none",
            boxShadow: "0 0 0 1px var(--accent)",
            background: replace.bgHex,
            color: overlay.colorHex,
            fontSize: overlay.fontSize * zoom,
            lineHeight: `${boxH}px`,
            fontFamily: catalogFontById(overlay.fontId).css,
            fontWeight: fontStyle.bold ? "bold" : "normal",
            fontStyle: fontStyle.italic ? "italic" : "normal",
          }}
        />
      </div>
    );
  }

  if (overlay.kind === "text") {
    return (
      <div
        style={{ position: "absolute", left: leftPx, top: topPx, zIndex: selected ? 15 : 5 }}
        onClick={(e) => e.stopPropagation()}
      >
        {toolbar}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            onPointerDown={startMove}
            title="Déplacer"
            style={{
              cursor: "move",
              color: "var(--text-muted)",
              userSelect: "none",
              lineHeight: 1,
            }}
          >
            ⠿
          </span>
          <input
            autoFocus
            value={overlay.text}
            onFocus={onSelect}
            onChange={(e) => updateDraftOverlay(overlay.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraftOverlay(overlay.id);
              if (e.key === "Escape") removeDraftOverlay(overlay.id);
            }}
            placeholder="Texte…"
            style={{
              fontSize: overlay.fontSize * zoom,
              fontFamily: catalogFontById(overlay.fontId).css,
              fontWeight: overlay.fontStyle.bold ? "bold" : "normal",
              fontStyle: overlay.fontStyle.italic ? "italic" : "normal",
              color: overlay.colorHex,
              background: "rgba(255,255,255,0.9)",
              border: selected ? "1px solid var(--accent)" : "1px dashed var(--border)",
              padding: "2px 4px",
              minWidth: 80,
            }}
          />
        </div>
      </div>
    );
  }

  const widthPx = overlay.widthRatio * canvasWidthPx;
  const heightPx = overlay.heightRatio * canvasHeightPx;

  return (
    <div
      style={{ position: "absolute", left: leftPx, top: topPx, width: widthPx, height: heightPx, zIndex: selected ? 15 : 5 }}
      onClick={(e) => e.stopPropagation()}
    >
      {toolbar}
      <div
        onPointerDown={startMove}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "move",
          border: selected ? "1px dashed var(--accent)" : "1px dashed transparent",
        }}
      >
        <img src={overlay.previewUrl} draggable={false} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
      {selected && (
        <div
          onPointerDown={startResize}
          title="Redimensionner"
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "var(--accent)",
            borderRadius: 2,
            cursor: "nwse-resize",
          }}
        />
      )}
    </div>
  );
}
