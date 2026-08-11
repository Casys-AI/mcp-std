/**
 * Build and verify deterministic gzip distributions of the MCP App viewers.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const skippedDirectories = new Set(["node_modules", "dist", "sdk"]);

function sourceViewerNames() {
  return readdirSync(moduleDirectory, { withFileTypes: true })
    .filter((entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      !skippedDirectories.has(entry.name) &&
      existsSync(resolve(moduleDirectory, entry.name, "index.html"))
    )
    .map((entry) => entry.name)
    .sort();
}

export function compressUiDist(
  distDirectory = resolve(moduleDirectory, "dist"),
) {
  let files = 0;
  let rawBytes = 0;
  let gzipBytes = 0;

  for (const viewer of sourceViewerNames()) {
    const htmlPath = resolve(distDirectory, viewer, "index.html");
    if (!existsSync(htmlPath)) {
      throw new Error(`Missing built UI bundle: ${htmlPath}`);
    }

    const html = readFileSync(htmlPath);
    const compressed = gzipSync(html, { level: 9, mtime: 0 });
    writeFileSync(`${htmlPath}.gz`, compressed);
    unlinkSync(htmlPath);

    files++;
    rawBytes += html.byteLength;
    gzipBytes += compressed.byteLength;
  }

  console.log(
    `Compressed ${files} UI bundles: ${rawBytes} -> ${gzipBytes} bytes`,
  );
  return { files, rawBytes, gzipBytes };
}

export function verifyUiDist(
  distDirectory = resolve(moduleDirectory, "dist"),
) {
  const expected = sourceViewerNames();
  const actual = readdirSync(distDirectory, { withFileTypes: true })
    .filter((entry) =>
      entry.isDirectory() &&
      existsSync(resolve(distDirectory, entry.name, "index.html.gz"))
    )
    .map((entry) => entry.name)
    .sort();

  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `Compressed viewer set differs from sources.\n` +
        `Expected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`,
    );
  }

  for (const viewer of actual) {
    const gzipPath = resolve(distDirectory, viewer, "index.html.gz");
    const html = gunzipSync(readFileSync(gzipPath)).toString("utf8");
    if (!/^<!doctype html>/i.test(html) || !/<html[\s>]/i.test(html)) {
      throw new Error(`Invalid HTML in compressed viewer: ${gzipPath}`);
    }
  }

  console.log(`Verified ${actual.length} compressed UI bundles`);
  return actual;
}

export function uiDistContentManifest(
  distDirectory = resolve(moduleDirectory, "dist"),
) {
  return sourceViewerNames().map((viewer) => {
    const gzipPath = resolve(distDirectory, viewer, "index.html.gz");
    if (!existsSync(gzipPath)) {
      throw new Error(`Missing compressed UI bundle: ${gzipPath}`);
    }

    const html = gunzipSync(readFileSync(gzipPath));
    const digest = createHash("sha256").update(html).digest("hex");
    return `${digest}  ${viewer}/index.html`;
  }).join("\n");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--manifest")) {
    console.log(uiDistContentManifest());
  } else if (process.argv.includes("--verify")) {
    verifyUiDist();
  } else {
    compressUiDist();
    verifyUiDist();
  }
}
