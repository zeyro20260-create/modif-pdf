#!/usr/bin/env node
/**
 * One-off icon generator: draws a simple flat "document" glyph entirely in pure JS
 * (no native deps / no browser canvas) and packs it into resources/icon.ico.
 * Not part of the app build — run manually with `node scripts/generate-icon.cjs`
 * whenever the icon design needs to change.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const toIco = require("to-ico");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUPERSAMPLE = 4;

const ACCENT_TOP = hex("#6ba0ff");
const ACCENT_BOTTOM = hex("#3a6fd1");
const WHITE = hex("#ffffff");
const FOLD = hex("#c7d7f5");
const LINE = hex("#aebede");
const BAND = hex("#e55353");

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const nx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : null;
  const ny = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : null;
  if (nx === null || ny === null) return true;
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const DOC = { x0: 0.26, y0: 0.16, x1: 0.74, y1: 0.84, r: 0.035 };
const FOLD_SIZE = 0.12;

function colorAt(x, y) {
  // Accent band near the bottom of the document (flat, no text — evokes a file-type tag).
  if (insideRoundRect(x, y, 0.3, 0.64, 0.7, 0.74, 0.02)) return BAND;

  // Three text lines.
  for (const ly of [0.32, 0.42, 0.52]) {
    if (insideRoundRect(x, y, 0.32, ly, 0.68, ly + 0.045, 0.01)) return LINE;
  }

  // Folded top-right corner of the document.
  if (
    insideTriangle(
      x,
      y,
      DOC.x1 - FOLD_SIZE,
      DOC.y0,
      DOC.x1,
      DOC.y0,
      DOC.x1,
      DOC.y0 + FOLD_SIZE
    )
  ) {
    return FOLD;
  }

  if (insideRoundRect(x, y, DOC.x0, DOC.y0, DOC.x1, DOC.y1, DOC.r)) return WHITE;

  if (insideRoundRect(x, y, 0.04, 0.04, 0.96, 0.96, 0.2)) {
    const t = (x + y) / 2;
    return {
      r: ACCENT_TOP.r + (ACCENT_BOTTOM.r - ACCENT_TOP.r) * t,
      g: ACCENT_TOP.g + (ACCENT_BOTTOM.g - ACCENT_TOP.g) * t,
      b: ACCENT_TOP.b + (ACCENT_BOTTOM.b - ACCENT_TOP.b) * t,
    };
  }

  return null; // transparent
}

function renderPng(size) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let coverage = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          const c = colorAt(x, y);
          if (c) {
            r += c.r;
            g += c.g;
            b += c.b;
            coverage += 1;
          }
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE;
      const idx = (size * py + px) << 2;
      if (coverage === 0) {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      } else {
        png.data[idx] = Math.round(r / coverage);
        png.data[idx + 1] = Math.round(g / coverage);
        png.data[idx + 2] = Math.round(b / coverage);
        png.data[idx + 3] = Math.round((coverage / total) * 255);
      }
    }
  }
  return PNG.sync.write(png);
}

async function main() {
  const pngBuffers = SIZES.map(renderPng);
  const outDir = path.resolve(__dirname, "../resources");
  fs.mkdirSync(outDir, { recursive: true });

  // Keep a PNG around too (useful for README/app icons outside Windows .ico).
  fs.writeFileSync(path.join(outDir, "icon.png"), pngBuffers[pngBuffers.length - 1]);

  const icoBuffer = await toIco(pngBuffers);
  fs.writeFileSync(path.join(outDir, "icon.ico"), icoBuffer);
  console.log(`Wrote ${path.join(outDir, "icon.ico")} (${icoBuffer.length} bytes, sizes: ${SIZES.join(", ")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
