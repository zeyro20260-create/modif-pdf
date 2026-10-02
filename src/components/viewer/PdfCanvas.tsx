import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";
import { renderPageToCanvas, getPageTextItems, sampleTextColors } from "@/lib/pdfEngine";
import type { PageTextItem } from "@/features/document/documentTypes";
import { dataUrlToArrayBuffer } from "@/lib/dataUrl";
import { DraftOverlayView } from "./DraftOverlayView";
import { TextRunHit } from "./TextRunHit";

export function PdfCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [textItems, setTextItems] = useState<PageTextItem[]>([]);

  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const zoom = useDocumentStore((s) => s.zoom);
  const activeTool = useDocumentStore((s) => s.activeTool);
  const addDraftText = useDocumentStore((s) => s.addDraftText);
  const addDraftReplaceText = useDocumentStore((s) => s.addDraftReplaceText);
  const addDraftImage = useDocumentStore((s) => s.addDraftImage);
  const draftOverlays = useDocumentStore((s) => s.draftOverlays);
  const lastSignatureDataUrl = useDocumentStore((s) => s.lastSignatureDataUrl);

  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return;
    if (currentPageIndex >= pdfJsDoc.numPages) return;
    let cancelled = false;
    renderPageToCanvas(pdfJsDoc, currentPageIndex + 1, canvasRef.current, zoom)
      .then(async () => {
        if (cancelled || !canvasRef.current) return;
        setCanvasSize({ width: canvasRef.current.width, height: canvasRef.current.height });
        // Fonts are only resolved once the page has been rendered, so read the text afterwards.
        const items = await getPageTextItems(pdfJsDoc, currentPageIndex);
        if (!cancelled) setTextItems(items);
      })
      .catch((err) => {
        if ((err as Error)?.name !== "RenderingCancelledException") console.error("Rendu de page échoué", err);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfJsDoc, currentPageIndex, zoom]);

  function startReplace(item: PageTextItem) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { bgHex, fgHex } = sampleTextColors(canvas, item);
    const colorsOf = (part?: { xRatio: number; widthRatio: number }) =>
      part ? sampleTextColors(canvas, { ...item, xRatio: part.xRatio, widthRatio: part.widthRatio }) : undefined;
    // Runs further right on the same line (e.g. a first name next to a surname) may need to be pushed.
    const lineEnd = item.xRatio + item.widthRatio + (item.tail?.widthRatio ?? 0);
    const neighbors = textItems
      .filter((t) => Math.abs(t.baselineRatio - item.baselineRatio) < 0.0015 && t.xRatio >= lineEnd - 0.002)
      .sort((a, b) => a.xRatio - b.xRatio)
      .map((t) => ({ item: t, ...sampleTextColors(canvas, t) }));
    setSelectedDraftId(
      addDraftReplaceText(currentPageIndex, { ...item, neighbors: undefined }, {
        bgHex,
        colorHex: fgHex,
        prefixColors: colorsOf(item.prefix),
        tailColors: colorsOf(item.tail),
        neighbors,
      })
    );
  }

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
        {activeTool === "text" &&
          textItems
            .filter(
              (item) =>
                !pageOverlays.some(
                  (o) =>
                    o.kind === "text" &&
                    o.replace &&
                    Math.abs(o.replace.baselineRatio - item.baselineRatio) < 1e-6 &&
                    Math.abs(o.xRatio - item.xRatio) < 1e-6
                )
            )
            .map((item, i) => (
              <TextRunHit
                key={i}
                item={item}
                canvasWidthPx={canvasSize.width}
                canvasHeightPx={canvasSize.height}
                onPick={startReplace}
              />
            ))}
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
