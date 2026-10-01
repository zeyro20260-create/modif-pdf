import { useDocumentStore } from "@/features/document/useDocumentStore";
import type { DraftOverlay } from "@/features/document/documentTypes";

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

  const toolbar = selected && (
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
      {overlay.kind === "text" && (
        <>
          <input
            type="number"
            min={8}
            max={96}
            value={overlay.fontSize}
            onChange={(e) => updateDraftOverlay(overlay.id, { fontSize: Number(e.target.value) || overlay.fontSize })}
            style={{ width: 48 }}
            title="Taille du texte"
          />
          <input
            type="color"
            value={overlay.colorHex}
            onChange={(e) => updateDraftOverlay(overlay.id, { colorHex: e.target.value })}
            title="Couleur"
          />
        </>
      )}
      <button onClick={() => commitDraftOverlay(overlay.id)} title="Valider">
        ✓
      </button>
      <button onClick={() => removeDraftOverlay(overlay.id)} title="Annuler">
        ✕
      </button>
    </div>
  );

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
              fontSize: overlay.fontSize,
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
