import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(
  root,
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);
const destDir = path.join(root, "public");
const dest = path.join(destDir, "pdf.worker.mjs");

try {
  if (!fs.existsSync(src)) {
    console.error(`[RUI] pdf.worker.mjs not found at: ${src}`);
    process.exit(0);
  }
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[RUI] Copied PDF.js worker -> ${dest}`);
} catch (err) {
  console.error("[RUI] Failed to copy PDF.js worker", err);
  process.exit(0);
}
