import { useDocumentStore } from "@/features/document/useDocumentStore";
import { SignaturePad } from "@/components/toolpanels/SignaturePad";
import { FormsPanel } from "@/components/toolpanels/FormsPanel";
import { OrganizePanel } from "@/components/toolpanels/OrganizePanel";
import { FONT_CATALOG } from "@/lib/fontCatalog";

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-muted)", marginTop: 0 }}>{children}</p>;
}

/** Controls for the text draft being edited (the latest one), kept off the page so the text stays visible. */
function TextDraftControls() {
  const draft = useDocumentStore((s) => [...s.draftOverlays].reverse().find((o) => o.kind === "text"));
  const update = useDocumentStore((s) => s.updateDraftOverlay);
  const commit = useDocumentStore((s) => s.commitDraftOverlay);
  const remove = useDocumentStore((s) => s.removeDraftOverlay);
  if (!draft || draft.kind !== "text") return null;

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <h4 style={{ margin: "0 0 8px" }}>{draft.replace ? "Texte modifié" : "Nouveau texte"}</h4>
      <div style={row}>
        <label style={{ width: 56 }}>Police</label>
        <select value={draft.fontId} onChange={(e) => update(draft.id, { fontId: e.target.value })} style={{ flex: 1 }}>
          {FONT_CATALOG.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div style={row}>
        <label style={{ width: 56 }}>Style</label>
        <label>
          <input
            type="checkbox"
            checked={draft.fontStyle.bold}
            onChange={(e) => update(draft.id, { fontStyle: { ...draft.fontStyle, bold: e.target.checked } })}
          />{" "}
          Gras
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.fontStyle.italic}
            onChange={(e) => update(draft.id, { fontStyle: { ...draft.fontStyle, italic: e.target.checked } })}
          />{" "}
          Italique
        </label>
      </div>
      <div style={row}>
        <label style={{ width: 56 }}>Taille</label>
        <input
          type="number"
          min={4}
          max={200}
          step={0.5}
          value={draft.fontSize}
          onChange={(e) => update(draft.id, { fontSize: Number(e.target.value) || draft.fontSize })}
          style={{ width: 64 }}
        />
        <input type="color" value={draft.colorHex} onChange={(e) => update(draft.id, { colorHex: e.target.value })} title="Couleur" />
      </div>
      <div style={row}>
        <button onClick={() => commit(draft.id)}>✓ Valider</button>
        <button onClick={() => remove(draft.id)}>✕ Annuler</button>
      </div>
    </div>
  );
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
      {activeTool === "text" && (
        <Hint>
          Sur un texte existant, cliquez pour sélectionner un mot ou glissez pour choisir un passage précis, puis tapez le remplacement : la police, la taille et la
          couleur d'origine sont reprises. Cliquez dans une zone vide pour ajouter un nouveau texte (poignée ⠿
          pour le déplacer). Validez avec Entrée ou ✓ ; Échap annule. Vider le champ efface le texte.
        </Hint>
      )}
      {activeTool === "text" && <TextDraftControls />}
      {activeTool === "image" && (
        <Hint>
          Cliquez sur la page pour insérer une image. Glissez-la pour la déplacer, utilisez la poignée en
          bas à droite pour la redimensionner, puis validez avec ✓.
        </Hint>
      )}
      {activeTool === "signature" && <SignaturePad />}
      {activeTool === "organize" && <OrganizePanel />}
      {activeTool === "forms" && <FormsPanel />}
    </div>
  );
}
