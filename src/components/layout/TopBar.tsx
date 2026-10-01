import { useDocumentStore } from "@/features/document/useDocumentStore";
import type { ToolId } from "@/features/document/documentTypes";

const TOOLS: { id: ToolId; label: string }[] = [
  { id: "select", label: "Sélection" },
  { id: "text", label: "Texte" },
  { id: "image", label: "Image" },
  { id: "signature", label: "Signature" },
  { id: "organize", label: "Organiser" },
  { id: "forms", label: "Formulaires" },
];

export function TopBar() {
  const fileName = useDocumentStore((s) => s.fileName);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const isBusy = useDocumentStore((s) => s.isBusy);
  const activeTool = useDocumentStore((s) => s.activeTool);
  const setActiveTool = useDocumentStore((s) => s.setActiveTool);
  const zoom = useDocumentStore((s) => s.zoom);
  const setZoom = useDocumentStore((s) => s.setZoom);
  const openFromBytes = useDocumentStore((s) => s.openFromBytes);
  const newBlankDocument = useDocumentStore((s) => s.newBlankDocument);
  const exportBytes = useDocumentStore((s) => s.exportBytes);
  const hasDoc = useDocumentStore((s) => s.pdfLibDoc !== null);

  async function handleOpen() {
    const result = await window.modifPdf.openPdf();
    if (!result) return;
    const name = result.filePath.split(/[\\/]/).pop() ?? "document.pdf";
    await openFromBytes(name, result.data);
  }

  async function handleSave() {
    const bytes = await exportBytes();
    await window.modifPdf.savePdf(fileName ?? "document.pdf", bytes);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <strong style={{ marginRight: 8 }}>ModifPDF</strong>
      <button onClick={handleOpen} disabled={isBusy}>
        Ouvrir
      </button>
      <button onClick={() => newBlankDocument()} disabled={isBusy}>
        Nouveau
      </button>
      <button className="primary" onClick={handleSave} disabled={isBusy || !hasDoc}>
        Enregistrer sous…
      </button>

      <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 8px" }} />

      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={activeTool === tool.id ? "active" : ""}
          onClick={() => setActiveTool(tool.id)}
          disabled={!hasDoc}
        >
          {tool.label}
        </button>
      ))}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--text-muted)" }}>
          {fileName ?? "Aucun document"}
          {isDirty ? " •" : ""}
        </span>
        <button onClick={() => setZoom(zoom - 0.1)} disabled={!hasDoc}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(zoom + 0.1)} disabled={!hasDoc}>
          +
        </button>
      </div>
    </div>
  );
}
