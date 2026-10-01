export type ToolId = "select" | "text" | "image" | "signature" | "organize" | "forms";

export interface FormFieldState {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "unsupported";
  value: string;
  options?: string[];
}
