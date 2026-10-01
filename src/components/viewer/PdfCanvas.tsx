import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";
import { renderPageToCanvas } from "@/lib/pdfEngine";
import { dataUrlToArrayBuffer } from "@/lib/dataUrl";
import { DraftOverlayView } from "./DraftOverlayView";

export function PdfCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const zoom = useDocumentStore((s) => s.zoom);
  const activeTool = useDocumentStore((s) => s.activeTool);
  const addDraftText = useDocumentStore((s) => s.addDraftText);
  const addDraftImage = useDocumentStore((s) => s.addDraftImage);
  const draftOverlays = useDocumentStore((s) => s.draftOverlays);
  const lastSignatureDataUrl = useDocumentStore((s) => s.lastSignatureDataUrl);

  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return;
    if (currentPageIndex >= pdfJsDoc.numPages) return;
    renderPageToCanvas(pdfJsDoc, currentPageIndex + 1, canvasRef.current, zoom)
      .then(() => {
        if (canvasRef.current) {
          setCanvasSize({ width: canvasRef.current.width, height: canvasRef.current.height });
        }
      })
      .catch(() => {});
  }, [pdfJsDoc, currentPageIndex, zoom]);

  function ratiosFromClick(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      xRatio: (e.clientX - rect.left) / rect.width,
      yRatio: (e.clientY - rect.top) / rect.height,
    };
  }

  async function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    const point = ratiosFromClick(e);
    if (!point) return;

    if (activeTool === "text") {
      const id = addDraftText(currentPageIndex, point.xRatio, point.yRatio);
      setSelectedDraftId(id);
      return;
    }

    if (activeTool === "image") {
      const images = await window.modifPdf.openImages();
      if (images.length === 0) return;
      const id = await addDraftImage(currentPageIndex, point.xRatio, point.yRatio, images[0].data);
      setSelectedDraftId(id);
      return;
    }

    if (activeTool === "signature") {
      if (!lastSignatureDataUrl) {
        window.alert("Dessinez d'abord une signature dans le panneau de droite.");
        return;
      }
      const bytes = dataUrlToArrayBuffer(lastSignatureDataUrl);
      const id = await addDraftImage(currentPageIndex, point.xRatio, point.yRatio, bytes);
      setSelectedDraftId(id);
    }
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
  const pageOverlays = draftOverlays.filter((o) => o.pageIndex === currentPageIndex);

  return (
    <div className="canvas-area">
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 0 0 1px var(--border)" }} />
        <div
          onClick={(e) => {
            setSelectedDraftId(null);
            handleOverlayClick(e);
          }}
          style={{
            position: "absolute",
            inset: 0,
            cursor: interactive ? "crosshair" : "default",
          }}
        />
        {pageOverlays.map((overlay) => (
          <DraftOverlayView
            key={overlay.id}
            overlay={overlay}
            canvasWidthPx={canvasSize.width}
            canvasHeightPx={canvasSize.height}
            selected={selectedDraftId === overlay.id}
            onSelect={() => setSelectedDraftId(overlay.id)}
          />
        ))}
      </div>
    </div>
  );
}
