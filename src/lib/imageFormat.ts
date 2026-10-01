export type ImageFormat = "png" | "jpg";

/** Detects PNG vs JPEG from magic bytes so callers don't have to trust file extensions. */
export function detectImageFormat(bytes: ArrayBuffer): ImageFormat {
  const header = new Uint8Array(bytes.slice(0, 8));
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;
  if (isPng) return "png";

  const isJpg = header[0] === 0xff && header[1] === 0xd8;
  if (isJpg) return "jpg";

  throw new Error("Format d'image non reconnu (PNG ou JPEG attendu).");
}
