import { assertEquals } from "@std/assert";
import { decodeViewerText, gunzipText } from "./gzip.ts";

Deno.test("gunzipText - restores MCP App HTML as text", async () => {
  const html = "<!doctype html><html><body>MCP App</body></html>";
  const source = new Blob([html]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());

  assertEquals(await gunzipText(bytes), html);
  assertEquals(await decodeViewerText(bytes), html);
  assertEquals(
    await decodeViewerText(new TextEncoder().encode(html)),
    html,
  );
});
