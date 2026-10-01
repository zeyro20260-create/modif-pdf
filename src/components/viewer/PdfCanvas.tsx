import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";
import { renderPageToCanvas } from "@/lib/pdfEngine";
import { dataUrlToArrayBuffer } from "@/lib/dataUrl";

interface PendingText {
  xRatio: number;
  yRatio: number;
  leftPx: number;
  topPx: number;
}

export function PdfCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const zoom = useDocumentStore((s) => s.zoom);
  const activeTool = useDocumentStore((s) => s.activeTool);
  const addTextAt = useDocumentStore((s) => s.addTextAt);
  const addImageAt = useDocumentStore((s) => s.addImageAt);
  const lastSignatureDataUrl = useDocumentStore((s) => s.lastSignatureDataUrl);

  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return;
    if (currentPageIndex >= pdfJsDoc.numPages) return;
    renderPageToCanvas(pdfJsDoc, currentPageIndex + 1, canvasRef.current, zoom).catch(() => {});
  }, [pdfJsDoc, currentPageIndex, zoom]);

  function ratiosFromClick(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const leftPx = e.clientX - rect.left;
    const topPx = e.clientY - rect.top;
    return {
      xRatio: leftPx / rect.width,
      yRatio: topPx / rect.height,
      leftPx,
      topPx,
    };
  }

  async function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    const point = ratiosFromClick(e);
    if (!point) return;

    if (activeTool === "text") {
      setPendingText(point);
      setTextDraft("");
      return;
    }

    if (activeTool === "image") {
      const images = await window.modifPdf.openImages();
      if (images.length === 0) return;
      await addImageAt(currentPageIndex, point.xRatio, point.yRatio, 0.3, 0.3, images[0].data);
      return;
    }

    if (activeTool === "signature") {
      if (!lastSignatureDataUrl) {
        window.alert("Dessinez d'abord une signature dans le panneau de droite.");
        return;
      }
      const bytes = dataUrlToArrayBuffer(lastSignatureDataUrl);
      await addImageAt(currentPageIndex, point.xRatio, point.yRatio, 0.22, 0.1, bytes);
    }
  }

  async function commitPendingText() {
    if (pendingText && textDraft.trim().length > 0) {
      await addTextAt(currentPageIndex, pendingText.xRatio, pendingText.yRatio, textDraft, 16, "#111111");
    }
    setPendingText(null);
    setTextDraft("");
  }

  if (!pdfJsDoc) {
    return (
      <div className="canvas-area">
        <div className="empty-state">
          <p>Aucun document ouvert.</p>
          <p>Utilisez « Ouvrir » ou « Nouveau » dans la barre du haut.</p>
        </div>
      </div>
    );
  }

  const interactive = activeTool === "text" || activeTool === "image" || activeTool === "signature";

  return (
    <div className="canvas-area">
      <div ref={containerRef} style={{ position: "relative" }}>
        <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 0 0 1px var(--border)" }} />
        <div
          onClick={handleOverlayClick}
          style={{
            position: "absolute",
            inset: 0,
            cursor: interactive ? "crosshair" : "default",
          }}
        />
        {pendingText && (
          <input
            autoFocus
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPendingText();
              if (e.key === "Escape") setPendingText(null);
            }}
            onBlur={commitPendingText}
            placeholder="Texte…"
            style={{
              position: "absolute",
              left: pendingText.leftPx,
              top: pendingText.topPx,
              transform: "translateY(-50%)",
              zIndex: 10,
            }}
          />
        )}
      </div>
    </div>
  );
}
