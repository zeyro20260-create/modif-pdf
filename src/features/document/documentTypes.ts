export type ToolId = "select" | "text" | "image" | "signature" | "organize" | "forms";

/**
 * An overlay the user is still positioning/editing on screen. Nothing is written
 * into the PDF until it's committed (see useDocumentStore.commitDraftOverlay) — this
 * is what lets text/images/signatures be dragged and resized before they're baked in.
 */
export type DraftOverlay =
  | {
      id: string;
      pageIndex: number;
      kind: "text";
      xRatio: number;
      yRatio: number;
      fontSize: number;
      colorHex: string;
      text: string;
    }
  | {
      id: string;
      pageIndex: number;
      kind: "image";
      xRatio: number;
      yRatio: number;
      widthRatio: number;
      heightRatio: number;
      imageBytes: ArrayBuffer;
      previewUrl: string;
    };

export interface FormFieldState {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "unsupported";
  value: string;
  options?: string[];
}
