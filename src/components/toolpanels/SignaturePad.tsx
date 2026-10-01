import { useRef, useState } from "react";
import { useDocumentStore } from "@/features/document/useDocumentStore";

export function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const setLastSignature = useDocumentStore((s) => s.setLastSignature);
  const lastSignatureDataUrl = useDocumentStore((s) => s.lastSignatureDataUrl);

  function getContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function useSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLastSignature(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Dessinez votre signature, puis cliquez sur « Utiliser cette signature ». Choisissez ensuite l'outil
        « Signature » et cliquez sur la page pour l'apposer.
      </p>
      <canvas
        ref={canvasRef}
        width={240}
        height={120}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ background: "#fff", borderRadius: 4, touchAction: "none", width: "100%" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={clear}>Effacer</button>
        <button className="primary" onClick={useSignature} disabled={!hasStroke}>
          Utiliser cette signature
        </button>
      </div>
      {lastSignatureDataUrl && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>Signature active :</div>
          <img
            src={lastSignatureDataUrl}
            alt="Signature"
            style={{ background: "#fff", borderRadius: 4, maxWidth: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
