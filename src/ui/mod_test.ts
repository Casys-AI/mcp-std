/**
 * Tests for UI module
 *
 * @module lib/std/src/ui/mod_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  listUiResources,
  loadUiHtml,
  registerUiBundle,
  UI_RESOURCES,
} from "./mod.ts";

Deno.test("UI_RESOURCES - contains table-viewer", () => {
  const resource = UI_RESOURCES["ui://mcp-std/table-viewer"];
  assertEquals(resource?.name, "Table Viewer");
  assertEquals(resource?.tools, []);
});

Deno.test("listUiResources - returns all registered UIs", () => {
  const resources = listUiResources();
  assertEquals(resources.length >= 1, true);
  assertEquals(
    resources.find((resource) => resource.uri === "ui://mcp-std/table-viewer")
      ?.meta.name,
    "Table Viewer",
  );
});

Deno.test("loadUiHtml - throws for unknown resource", async () => {
  await assertRejects(
    async () => await loadUiHtml("ui://mcp-std/unknown"),
    Error,
    "UI resource not found",
  );
});

Deno.test("registerUiBundle - allows runtime registration", async () => {
  const testUri = "ui://mcp-std/test-ui";
  const testHtml = "<html><body>Test</body></html>";

  registerUiBundle(testUri, testHtml);

  const loaded = await loadUiHtml(testUri);
  assertEquals(loaded, testHtml);
});
