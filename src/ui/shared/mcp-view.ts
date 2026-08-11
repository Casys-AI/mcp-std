/**
 * Incremental MCP View adapter for legacy mcp-std Preact viewers.
 *
 * The visible viewer remains a Preact-owned surface. MCP View owns the
 * iframe lifecycle in an inert sibling root, so it can install result and
 * teardown handlers before the MCP Apps handshake without competing with
 * Preact for the viewer DOM.
 */

import { createMcpApp, defineView } from "@casys/mcp-view";
import { installMcpViewTheme } from "@casys/mcp-view/preact/components";
import type { AppHandle, ToolResult } from "@casys/mcp-view";

export interface McpViewViewerOptions {
  readonly name: string;
  readonly version: string;
  readonly onToolResult: (result: unknown) => void;
  readonly onTeardown?: () => void;
}

export interface McpViewViewer {
  updateModelContext(event: string, data: Record<string, unknown>): void;
  dispose(): Promise<void>;
}

/**
 * Start a result-driven MCP App without taking over the Preact render root.
 *
 * `createMcpApp` wires its one-shot notifications and `onteardown` before
 * `connect()`, buffers notifications received during the handshake, and
 * disposes the transport exactly once.
 */
export function startMcpViewViewer(
  options: McpViewViewerOptions,
): McpViewViewer {
  installMcpViewTheme();

  const lifecycleRoot = document.createElement("div");
  lifecycleRoot.hidden = true;
  lifecycleRoot.setAttribute("aria-hidden", "true");
  lifecycleRoot.dataset.mcpViewLifecycle = options.name;
  document.body.append(lifecycleRoot);

  let handle: AppHandle<Record<string, never>> | undefined;
  let disposed = false;
  let tornDown = false;

  const cleanup = (notifyViewer = false): void => {
    if (tornDown) return;
    tornDown = true;
    lifecycleRoot.remove();
    if (notifyViewer) options.onTeardown?.();
  };

  void createMcpApp<Record<string, never>>({
    info: { name: options.name, version: options.version },
    root: lifecycleRoot,
    views: {
      waiting: defineView({
        render: () => document.createDocumentFragment(),
      }),
    },
    initialView: "waiting",
    onToolResult: (result) => {
      if (!disposed) options.onToolResult(readViewerResult(result));
    },
    onTeardown: () => cleanup(true),
  }).then((connected) => {
    handle = connected;
    if (disposed) void connected.dispose();
  }).catch((error) => {
    lifecycleRoot.remove();
    if (!disposed) {
      console.warn(`[${options.name}] MCP View handshake failed`, error);
    }
  });

  return {
    updateModelContext(event, data) {
      if (!handle || disposed) return;
      void handle.ctx.app.updateModelContext({
        content: [{
          type: "text",
          text: `User ${event}: ${JSON.stringify(data)}`,
        }],
        structuredContent: { event, ...data },
      }).catch((error) => {
        console.warn(`[${options.name}] Model context update failed`, error);
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      cleanup();
      await handle?.dispose();
    },
  };
}

/**
 * Prefer MCP `structuredContent`. The JSON text fallback is retained only for
 * old tools that have not yet been upgraded to emit a structured result.
 */
export function readViewerResult(result: ToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;

  for (const block of result.content) {
    if (block.type !== "text") continue;
    try {
      return JSON.parse(block.text);
    } catch {
      // Human-readable text is a valid fallback; try the next block.
    }
  }
  return undefined;
}
