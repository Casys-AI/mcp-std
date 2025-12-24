/**
 * Project Path Utilities
 *
 * Centralized path resolution for Casys PML.
 * Detects project root by looking for deno.json marker file.
 * All relative paths should be resolved through this module.
 *
 * Cross-platform: Works on Linux, macOS, and Windows.
 *
 * @module lib/paths
 */

import { join } from "@std/path";

let _projectRoot: string | null = null;
const IS_WINDOWS = Deno.build.os === "windows";
const SEP = IS_WINDOWS ? "\\" : "/";

/**
 * Get the project root directory.
 *
 * Detection strategy:
 * 1. Check PROJECT_ROOT env var (explicit override)
 * 2. Walk up from this file's location looking for deno.json
 *
 * Results are cached for performance.
 *
 * @returns Absolute path to project root
 * @throws Error if project root cannot be determined
 */
export function getProjectRoot(): string {
  if (_projectRoot) {
    return _projectRoot;
  }

  // Allow explicit override via env var
  const envRoot = Deno.env.get("PROJECT_ROOT");
  if (envRoot) {
    _projectRoot = envRoot;
    return _projectRoot;
  }

  // Walk up from this file's directory looking for deno.json
  let currentDir = new URL(".", import.meta.url).pathname;

  // Windows: Remove leading slash from /C:/path format
  if (IS_WINDOWS && currentDir.startsWith("/") && currentDir[2] === ":") {
    currentDir = currentDir.slice(1);
  }

  // Normalize separators
  currentDir = currentDir.replaceAll("/", SEP);

  // Remove trailing separator if present
  if (currentDir.endsWith(SEP)) {
    currentDir = currentDir.slice(0, -1);
  }

  // Walk up max 10 levels (safety limit)
  for (let i = 0; i < 10; i++) {
    try {
      const denoJsonPath = join(currentDir, "deno.json");
      Deno.statSync(denoJsonPath);
      // Found it!
      _projectRoot = currentDir;
      return _projectRoot;
    } catch {
      // Not found, go up one level
      const lastSep = currentDir.lastIndexOf(SEP);
      if (lastSep <= 0) {
        break;
      }
      currentDir = currentDir.substring(0, lastSep);
    }
  }

  throw new Error(
    "Cannot determine project root. Ensure deno.json exists or set PROJECT_ROOT env var.",
  );
}

/**
 * Resolve a path relative to project root.
 *
 * If the path is already absolute, returns it unchanged.
 * If relative, resolves against project root.
 *
 * @param relativePath - Path to resolve (can be relative or absolute)
 * @returns Absolute path
 *
 * @example
 * resolvePath("./drizzle") // /home/user/project/drizzle
 * resolvePath(".pml-dev.db") // /home/user/project/.pml-dev.db
 * resolvePath("/absolute/path") // /absolute/path (unchanged)
 */
export function resolvePath(relativePath: string): string {
  // Already absolute (Unix or Windows)
  if (relativePath.startsWith("/") || (IS_WINDOWS && /^[A-Za-z]:/.test(relativePath))) {
    return relativePath;
  }

  // Home directory expansion (only at start of path)
  if (relativePath.startsWith("~/") || relativePath === "~") {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (!homeDir) {
      throw new Error("Cannot expand ~ - HOME not set");
    }
    return join(homeDir, relativePath.slice(2) || "");
  }

  // Resolve relative path against project root
  const root = getProjectRoot();
  // Handle "./path" and "path" forms
  const cleanPath = relativePath.startsWith("./") || relativePath.startsWith(".\\")
    ? relativePath.slice(2)
    : relativePath;
  return join(root, cleanPath);
}

/**
 * Clear cached project root.
 * Exported for testing purposes only - do not use in production code.
 * @internal
 */
export function _clearProjectRootCache(): void {
  _projectRoot = null;
}
