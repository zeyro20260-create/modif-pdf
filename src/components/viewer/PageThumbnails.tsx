import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";
import { renderPageToCanvas } from "@/lib/pdfEngine";

function Thumbnail({ pageIndex }: { pageIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const deletePage = useDocumentStore((s) => s.deletePage);
  const rotateCurrentPage = useDocumentStore((s) => s.rotateCurrentPage);
  const movePage = useDocumentStore((s) => s.movePage);
  const pageCount = useDocumentStore((s) => s.pageCount);

  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return;
    renderPageToCanvas(pdfJsDoc, pageIndex + 1, canvasRef.current, 0.22).catch(() => {});
  }, [pdfJsDoc, pageIndex]);

  async function handleRotate(e: React.MouseEvent) {
    e.stopPropagation();
    setCurrentPage(pageIndex);
    await rotateCurrentPage(90);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (pageCount <= 1) return;
    await deletePage(pageIndex);
  }

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(pageIndex))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from) && from !== pageIndex) movePage(from, pageIndex);
      }}
      onClick={() => setCurrentPage(pageIndex)}
      style={{
        border: currentPageIndex === pageIndex ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: 4,
        padding: 4,
        marginBottom: 10,
        cursor: "grab",
        background: "var(--bg-elevated)",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", background: "#fff" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ color: "var(--text-muted)" }}>{pageIndex + 1}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={handleRotate} title="Pivoter" style={{ padding: "2px 6px" }}>
            ⟳
          </button>
          <button onClick={handleDelete} title="Supprimer" style={{ padding: "2px 6px" }} disabled={pageCount <= 1}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageThumbnails() {
  const pageCount = useDocumentStore((s) => s.pageCount);
  const addImagesAsPages = useDocumentStore((s) => s.addImagesAsPages);
  const mergePdfBytes = useDocumentStore((s) => s.mergePdfBytes);
  const [busy, setBusy] = useState(false);

  async function handleAddImages() {
    setBusy(true);
    try {
      const images = await window.modifPdf.openImages();
      if (images.length > 0) await addImagesAsPages(images.map((i) => i.data));
    } finally {
      setBusy(false);
    }
  }

  async function handleMergePdf() {
    setBusy(true);
    try {
      const result = await window.modifPdf.openPdf();
      if (result) await mergePdfBytes(result.data);
    } finally {
      setBusy(false);
    }
  }

  if (pageCount === 0) {
    return <div className="panel" />;
  }

  return (
    <div className="panel" style={{ padding: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        <button onClick={handleAddImages} disabled={busy}>
          + Page depuis image
        </button>
        <button onClick={handleMergePdf} disabled={busy}>
          + Fusionner un PDF
        </button>
      </div>
      {Array.from({ length: pageCount }, (_, i) => (
        <Thumbnail key={i} pageIndex={i} />
      ))}
    </div>
  );
}
