import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { PageThumbnails } from "@/components/viewer/PageThumbnails";
import { PdfCanvas } from "@/components/viewer/PdfCanvas";
import { useDocumentStore } from "@/features/document/useDocumentStore";

export default function App() {
  const errorMessage = useDocumentStore((s) => s.errorMessage);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-layout">
        <PageThumbnails />
        <PdfCanvas />
        <RightPanel />
      </div>
      {errorMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--danger)",
            color: "white",
            padding: "8px 16px",
            borderRadius: 6,
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
