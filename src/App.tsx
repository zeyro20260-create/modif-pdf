import { useEffect } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { PageThumbnails } from "@/components/viewer/PageThumbnails";
import { PdfCanvas } from "@/components/viewer/PdfCanvas";
import { useDocumentStore } from "@/features/document/useDocumentStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export default function App() {
  const errorMessage = useDocumentStore((s) => s.errorMessage);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

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
