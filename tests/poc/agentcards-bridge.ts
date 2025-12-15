/**
 * POC: Casys PML Bridge for Sandbox
 *
 * Provides MCP tools access from within Deno sandbox via message passing.
 * This is injected into the sandbox worker context.
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface CallToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

// Pending requests map (request ID → promise handlers)
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Setup message listener for responses from host
 */
function setupMessageListener() {
  self.addEventListener("message", (event: MessageEvent) => {
    const { requestId, tools, result, error } = event.data;

    const pending = pendingRequests.get(requestId);
    if (pending) {
      if (error) {
        pending.reject(new Error(error));
      } else if (tools !== undefined) {
        pending.resolve(tools);
      } else if (result !== undefined) {
        pending.resolve(result);
      }
      pendingRequests.delete(requestId);
    }
  });
}

// Initialize listener
setupMessageListener();

/**
 * Search for MCP tools using vector search
 *
 * @param query - Natural language query
 * @param limit - Maximum number of results (default: 10)
 * @param threshold - Similarity threshold (default: 0.6)
 * @returns Array of matching tools
 */
export async function searchTools(
  query: string,
  limit = 10,
  threshold = 0.6,
): Promise<MCPTool[]> {
  const requestId = crypto.randomUUID();

  // Send message to host
  postMessage({
    type: "search_tools",
    requestId,
    query,
    limit,
    threshold,
  });

  // Wait for response
  return new Promise<MCPTool[]>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Vector search timeout"));
      }
    }, 5000);
  });
}

/**
 * Call an MCP tool
 *
 * @param name - Tool name (format: "server:tool")
 * @param args - Tool arguments
 * @returns Tool execution result
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const requestId = crypto.randomUUID();

  // Send message to host
  postMessage({
    type: "call_tool",
    requestId,
    name,
    args,
  });

  // Wait for response
  return new Promise<CallToolResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Tool call timeout"));
      }
    }, 10000);
  });
}

/**
 * Log message (for debugging)
 */
export function log(message: string): void {
  postMessage({
    type: "log",
    message,
  });
}
