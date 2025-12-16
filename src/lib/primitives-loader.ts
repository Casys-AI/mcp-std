/**
 * Primitives Bundle Loader
 *
 * Ensures the primitives bundle is up-to-date for sandbox use.
 * Automatically rebuilds if source files have changed.
 *
 * @module src/lib/primitives-loader
 */

import * as log from "@std/log";

// Paths relative to project root
// src/lib/primitives-loader.ts → ../.. → project root
const PROJECT_ROOT = new URL("../..", import.meta.url).pathname;
const PRIMITIVES_DIR = `${PROJECT_ROOT}lib/primitives/`;
const BUNDLE_PATH = `${PRIMITIVES_DIR}bundle.js`;
const BUILD_SCRIPT = `${PRIMITIVES_DIR}build.ts`;

// Source files to watch
const SOURCE_FILES = [
  "mod.ts",
  "types.ts",
  "text.ts",
  "json.ts",
  "math.ts",
  "datetime.ts",
  "crypto.ts",
  "collections.ts",
  "vfs.ts",
  "data.ts",
  "http.ts",
  "validation.ts",
  "format.ts",
  "transform.ts",
  "state.ts",
  "compare.ts",
  "algo.ts",
];

/**
 * Check if bundle needs rebuild by comparing mtimes
 */
async function needsRebuild(): Promise<boolean> {
  // Check if bundle exists
  try {
    await Deno.stat(BUNDLE_PATH);
  } catch {
    log.info("Primitives bundle not found, will build...");
    return true;
  }

  // Get bundle mtime
  const bundleStat = await Deno.stat(BUNDLE_PATH);
  const bundleMtime = bundleStat.mtime?.getTime() ?? 0;

  // Check if any source file is newer
  for (const file of SOURCE_FILES) {
    try {
      const stat = await Deno.stat(`${PRIMITIVES_DIR}${file}`);
      const mtime = stat.mtime?.getTime() ?? 0;
      if (mtime > bundleMtime) {
        log.info(`Primitives source changed: ${file}`);
        return true;
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return false;
}

/**
 * Run the build script
 */
async function runBuild(): Promise<boolean> {
  log.info("🔨 Building primitives bundle...");

  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-run",
      BUILD_SCRIPT,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    log.error(`Build failed: ${errorText}`);
    return false;
  }

  const output = new TextDecoder().decode(stdout);
  log.info(output.trim());
  return true;
}

/**
 * Ensure primitives bundle is ready
 *
 * Called at server startup. Checks if source files have changed
 * and rebuilds the bundle if needed.
 */
export async function ensurePrimitivesBundle(): Promise<void> {
  if (await needsRebuild()) {
    const success = await runBuild();
    if (!success) {
      log.warn("⚠️  Primitives bundle build failed, sandbox may have limited tools");
    }
  } else {
    log.debug("Primitives bundle up-to-date");
  }
}

/**
 * Get path to the primitives bundle
 */
export function getPrimitivesBundlePath(): string {
  return BUNDLE_PATH;
}
