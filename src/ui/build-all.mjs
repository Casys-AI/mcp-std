/**
 * Build all UI components individually
 *
 * vite-plugin-singlefile doesn't support multiple inputs,
 * so we build each UI separately.
 */

import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compressUiDist, verifyUiDist } from "./compress-dist.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find all UI directories with index.html
const skip = ["node_modules", "dist", "sdk"];
const uis = readdirSync(__dirname).filter((entry) => {
  const entryPath = resolve(__dirname, entry);
  if (!statSync(entryPath).isDirectory()) return false;
  if (entry.startsWith(".") || skip.includes(entry)) return false;

  try {
    statSync(resolve(entryPath, "index.html"));
    return true;
  } catch {
    return false;
  }
});

console.log(`\n🎨 Building ${uis.length} UIs: ${uis.join(", ")}\n`);

// Ensure dist directory exists
mkdirSync(resolve(__dirname, "dist"), { recursive: true });

// Build each UI
for (const ui of uis) {
  console.log(`📦 Building ${ui}...`);

  try {
    execSync(`npx vite build --config vite.single.config.mjs`, {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env, UI_NAME: ui },
    });
    console.log(`✅ ${ui} built successfully\n`);
  } catch (error) {
    console.error(`❌ Failed to build ${ui}\n`);
    process.exit(1);
  }
}

compressUiDist(resolve(__dirname, "dist"));
verifyUiDist(resolve(__dirname, "dist"));

console.log(`\n🎉 All UIs built successfully!`);
