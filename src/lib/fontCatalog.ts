import type { TextFontStyle } from "@/features/document/documentTypes";

/**
 * Fonts shipped with Windows that can be embedded in the PDF. Replacing text with the same face as
 * the original (or its closest Windows equivalent) keeps widths and look much closer than the
 * 14 built-in PDF fonts. `files` are [regular, bold, italic, boldItalic] names in C:\Windows\Fonts.
 */
export interface CatalogFont {
  id: string;
  label: string;
  /** CSS font-family used for the on-screen editor. */
  css: string;
  /** Matched against the original font's name (lowercased, letters/digits only). */
  pattern: RegExp;
  files: [string, string, string, string];
}

export const FONT_CATALOG: CatalogFont[] = [
  {
    id: "arial",
    label: "Arial / Helvetica",
    css: 'Arial, "Liberation Sans", Helvetica, sans-serif',
    pattern: /arial|helvetica|liberationsans|nimbussans/,
    files: ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"],
  },
  {
    id: "times",
    label: "Times New Roman",
    css: '"Times New Roman", "Liberation Serif", Times, serif',
    pattern: /times|liberationserif|nimbusroman/,
    files: ["times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"],
  },
  {
    id: "courier",
    label: "Courier New",
    css: '"Courier New", "Liberation Mono", Courier, monospace',
    pattern: /courier|liberationmono/,
    files: ["cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf"],
  },
  {
    id: "calibri",
    label: "Calibri",
    css: 'Calibri, Carlito, "Segoe UI", sans-serif',
    pattern: /calibri|carlito/,
    files: ["calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"],
  },
  {
    id: "verdana",
    label: "Verdana",
    css: "Verdana, sans-serif",
    pattern: /verdana/,
    files: ["verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf"],
  },
  {
    id: "tahoma",
    label: "Tahoma",
    css: "Tahoma, sans-serif",
    pattern: /tahoma/,
    files: ["tahoma.ttf", "tahomabd.ttf", "tahoma.ttf", "tahomabd.ttf"],
  },
  {
    id: "segoe",
    label: "Segoe UI",
    css: '"Segoe UI", sans-serif',
    pattern: /segoe/,
    files: ["segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"],
  },
  {
    id: "georgia",
    label: "Georgia",
    css: "Georgia, serif",
    pattern: /georgia/,
    files: ["georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"],
  },
  {
    id: "trebuchet",
    label: "Trebuchet MS",
    css: '"Trebuchet MS", sans-serif',
    pattern: /trebuchet/,
    files: ["trebuc.ttf", "trebucbd.ttf", "trebucit.ttf", "trebucbi.ttf"],
  },
  {
    id: "consolas",
    label: "Consolas",
    css: "Consolas, monospace",
    pattern: /consolas/,
    files: ["consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf"],
  },
];

export function catalogFontById(id: string): CatalogFont {
  return FONT_CATALOG.find((f) => f.id === id) ?? FONT_CATALOG[0];
}

/** Best catalog match for an original font name; unknown fonts fall back on their general class. */
export function matchCatalogFont(realName: string, style: TextFontStyle): CatalogFont {
  const key = realName.toLowerCase().replace(/^[a-z]{6}\+/, "").replace(/[^a-z0-9]/g, "");
  const byName = FONT_CATALOG.find((f) => f.pattern.test(key));
  if (byName) return byName;
  return catalogFontById(style.family === "serif" ? "times" : style.family === "mono" ? "courier" : "arial");
}

export function catalogFileName(font: CatalogFont, style: Pick<TextFontStyle, "bold" | "italic">): string {
  const index = (style.bold ? 1 : 0) + (style.italic ? 2 : 0);
  return font.files[index];
}
