import { useDocumentStore } from "@/features/document/useDocumentStore";
import { SignaturePad } from "@/components/toolpanels/SignaturePad";
import { FormsPanel } from "@/components/toolpanels/FormsPanel";
import { OrganizePanel } from "@/components/toolpanels/OrganizePanel";

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-muted)", marginTop: 0 }}>{children}</p>;
}

export function RightPanel() {
  const activeTool = useDocumentStore((s) => s.activeTool);
  const hasDoc = useDocumentStore((s) => s.pdfLibDoc !== null);

  if (!hasDoc) return <div className="panel right" />;

  return (
    <div className="panel right" style={{ padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        {activeTool === "select" && "Sélection"}
        {activeTool === "text" && "Ajouter du texte"}
        {activeTool === "image" && "Ajouter une image"}
        {activeTool === "signature" && "Signature"}
        {activeTool === "organize" && "Organiser les pages"}
        {activeTool === "forms" && "Formulaire"}
      </h3>

      {activeTool === "select" && <Hint>Choisissez un outil dans la barre du haut pour commencer à éditer.</Hint>}
      {activeTool === "text" && <Hint>Cliquez n'importe où sur la page pour placer un champ de texte.</Hint>}
      {activeTool === "image" && <Hint>Cliquez sur la page pour choisir une image à insérer à cet endroit.</Hint>}
      {activeTool === "signature" && <SignaturePad />}
      {activeTool === "organize" && <OrganizePanel />}
      {activeTool === "forms" && <FormsPanel />}
    </div>
  );
}
