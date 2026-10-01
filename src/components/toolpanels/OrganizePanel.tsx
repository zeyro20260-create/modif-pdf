import { useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";

export function OrganizePanel() {
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const splitCurrentPageOut = useDocumentStore((s) => s.splitCurrentPageOut);
  const [busy, setBusy] = useState(false);

  async function handleExtract() {
    setBusy(true);
    try {
      const bytes = await splitCurrentPageOut(currentPageIndex);
      await window.modifPdf.savePdf(`page-${currentPageIndex + 1}.pdf`, bytes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Glissez-déposez les miniatures dans la colonne de gauche pour réordonner les pages. Utilisez les
        icônes ⟳ / ✕ sur chaque miniature pour pivoter ou supprimer.
      </p>
      <p>
        Page actuelle : <strong>{currentPageIndex + 1}</strong> / {pageCount}
      </p>
      <button onClick={handleExtract} disabled={busy}>
        Extraire cette page dans un nouveau PDF
      </button>
    </div>
  );
}
