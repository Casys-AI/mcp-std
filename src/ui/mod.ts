/**
 * MCP Apps UI Module for lib/std
 *
 * Provides infrastructure for bundling and serving UI components
 * for MiniTools via the MCP Apps extension (SEP-1865).
 *
 * @module lib/std/src/ui
 */

import { MCP_APP_MIME_TYPE } from "@casys/mcp-server";

// Re-export for convenience
export { MCP_APP_MIME_TYPE };

/**
 * Metadata for UI resources
 */
export interface UIResourceMeta {
  /** Human-readable name */
  name: string;
  /** Description of the UI */
  description: string;
  /** Tools that use this UI */
  tools: string[];
}

/**
 * Auto-discover UI resources from dist/ folder
 */
function discoverUiResources(): Record<string, UIResourceMeta> {
  const resources: Record<string, UIResourceMeta> = {};
  const distPath = new URL("./dist", import.meta.url).pathname;

  try {
    for (const entry of Deno.readDirSync(distPath)) {
      if (entry.isDirectory) {
        const uiName = entry.name;
        const uri = `ui://mcp-std/${uiName}`;

        // Check if index.html exists
        try {
          Deno.statSync(`${distPath}/${uiName}/index.html`);
          resources[uri] = {
            name: uiName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            description: `MCP Apps UI: ${uiName}`,
            tools: [],
          };
        } catch {
          // No index.html, skip
        }
      }
    }
  } catch (e) {
    console.error(`[mcp-std/ui] Failed to discover UIs from ${distPath}:`, e);
  }

  return resources;
}

/**
 * Registry of available UI resources
 * Auto-discovered from dist/ folder
 */
export const UI_RESOURCES: Record<string, UIResourceMeta> = discoverUiResources();

/**
 * Embedded UI HTML bundles
 * Populated at build time by Vite or manually for development
 */
const UI_BUNDLES: Record<string, string> = {};

/**
 * Load UI HTML for a given resource URI
 *
 * In production: Returns embedded HTML bundle
 * In development: Loads from file system
 *
 * @param uri - The ui:// resource URI
 * @returns The HTML content to serve
 * @throws Error if UI resource not found
 */
export async function loadUiHtml(uri: string): Promise<string> {
  // Check embedded bundles first
  if (UI_BUNDLES[uri]) {
    return UI_BUNDLES[uri];
  }

  // Development: Try to load from file
  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      const content = await Deno.readTextFile(uiPath);
      return content;
    } catch (e) {
      // Fall through to error
      console.error(`[mcp-std/ui] Failed to load UI from ${uiPath}:`, e);
    }
  }

  throw new Error(`[mcp-std/ui] UI resource not found: ${uri}. ` +
    `Run 'deno task build:ui' to generate bundled UIs.`);
}

/**
 * Register a UI bundle (called by build script)
 *
 * @param uri - The ui:// resource URI
 * @param html - The HTML content
 */
export function registerUiBundle(uri: string, html: string): void {
  UI_BUNDLES[uri] = html;
}

/**
 * Convert ui:// URI to file path for development loading
 */
function uriToPath(uri: string): string | null {
  // ui://mcp-std/table-viewer -> src/ui/dist/table-viewer/index.html
  const match = uri.match(/^ui:\/\/mcp-std\/(.+)$/);
  if (match) {
    const uiName = match[1];
    // Try dist first (built), then src (development)
    const distPath = new URL(`./dist/${uiName}/index.html`, import.meta.url).pathname;
    const srcPath = new URL(`./${uiName}/index.html`, import.meta.url).pathname;
    try {
      Deno.statSync(distPath);
      return distPath;
    } catch {
      return srcPath;
    }
  }
  return null;
}

/**
 * List all available UI resources
 */
export function listUiResources(): Array<{ uri: string; meta: UIResourceMeta }> {
  return Object.entries(UI_RESOURCES).map(([uri, meta]) => ({ uri, meta }));
}
