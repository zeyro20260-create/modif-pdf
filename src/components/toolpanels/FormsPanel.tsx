import { useEffect } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";

export function FormsPanel() {
  const formFields = useDocumentStore((s) => s.formFields);
  const refreshFormFields = useDocumentStore((s) => s.refreshFormFields);
  const updateFormFieldValue = useDocumentStore((s) => s.updateFormFieldValue);
  const flattenForm = useDocumentStore((s) => s.flattenForm);

  useEffect(() => {
    refreshFormFields();
    // Only when this panel mounts / the active tool switches to "forms".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (formFields.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Ce document ne contient aucun champ de formulaire (AcroForm).</p>;
  }

  return (
    <div>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Champs détectés dans le PDF :</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {formFields.map((field) => (
          <label key={field.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{field.name}</span>
            {field.type === "text" && (
              <input
                value={field.value}
                onChange={(e) => updateFormFieldValue(field, e.target.value)}
              />
            )}
            {field.type === "checkbox" && (
              <input
                type="checkbox"
                checked={field.value === "true"}
                onChange={(e) => updateFormFieldValue(field, e.target.checked ? "true" : "false")}
              />
            )}
            {(field.type === "radio" || field.type === "dropdown") && (
              <select value={field.value} onChange={(e) => updateFormFieldValue(field, e.target.value)}>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
            {field.type === "unsupported" && <span>(type non pris en charge)</span>}
          </label>
        ))}
      </div>
      <button style={{ marginTop: 14 }} onClick={() => flattenForm()}>
        Aplatir le formulaire (rend les valeurs définitives)
      </button>
    </div>
  );
}
