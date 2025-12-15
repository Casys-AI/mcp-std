/**
 * Unit tests for EventsStreamManager
 * Story 6.1: Real-time Events Stream (SSE)
 * Story 6.5: EventBus Integration (ADR-036)
 */

import { assertEquals, assertExists } from "@std/assert";
import { EventsStreamManager } from "../../../src/server/events-stream.ts";
import { eventBus } from "../../../src/events/mod.ts";

Deno.test("EventsStreamManager - initialization", () => {
  const manager = new EventsStreamManager();

  const stats = manager.getStats();
  assertEquals(stats.connectedClients, 0);
  assertExists(stats.uptimeSeconds);

  manager.close();
});

Deno.test("EventsStreamManager - client limit enforcement", async () => {
  const manager = new EventsStreamManager({
    maxClients: 2,
    heartbeatIntervalMs: 60000,
    corsOrigins: [],
  });

  // Mock abort controller for request cleanup
  const createMockRequest = () => {
    const controller = new AbortController();
    return new Request("http://localhost/events/stream", {
      signal: controller.signal,
    });
  };

  // Add 2 clients (should succeed)
  const req1 = createMockRequest();
  const res1 = manager.handleRequest(req1);
  assertEquals(res1.status, 200);
  assertEquals(res1.headers.get("Content-Type"), "text/event-stream");

  const req2 = createMockRequest();
  const res2 = manager.handleRequest(req2);
  assertEquals(res2.status, 200);

  // 3rd client should be rejected (503)
  const req3 = createMockRequest();
  const res3 = manager.handleRequest(req3);
  assertEquals(res3.status, 503);

  const body = await res3.json();
  assertEquals(body.error, "Too many clients");
  assertEquals(body.max, 2);

  manager.close();
});

Deno.test("EventsStreamManager - CORS headers", () => {
  const manager = new EventsStreamManager({
    maxClients: 100,
    heartbeatIntervalMs: 60000,
    corsOrigins: ["http://localhost:3000", "http://localhost:*"],
  });

  // Test with allowed origin
  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    headers: { "Origin": "http://localhost:3000" },
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");

  manager.close();
});

Deno.test("EventsStreamManager - CORS wildcard pattern", () => {
  const manager = new EventsStreamManager({
    maxClients: 100,
    heartbeatIntervalMs: 60000,
    corsOrigins: ["http://localhost:*"],
  });

  // Test wildcard match
  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    headers: { "Origin": "http://localhost:8080" },
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");

  manager.close();
});

Deno.test("EventsStreamManager - response headers", () => {
  const manager = new EventsStreamManager();

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);

  assertEquals(res.headers.get("Content-Type"), "text/event-stream");
  assertEquals(res.headers.get("Cache-Control"), "no-cache");
  assertEquals(res.headers.get("Connection"), "keep-alive");
  assertEquals(res.headers.get("X-Accel-Buffering"), "no");

  manager.close();
});

Deno.test("EventsStreamManager - stats tracking", () => {
  const manager = new EventsStreamManager();

  const stats1 = manager.getStats();
  assertEquals(stats1.connectedClients, 0);

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });
  manager.handleRequest(req);

  const stats2 = manager.getStats();
  assertEquals(stats2.connectedClients, 1);

  manager.close();

  const stats3 = manager.getStats();
  assertEquals(stats3.connectedClients, 0);
});

Deno.test("EventsStreamManager - cleanup on close", () => {
  const manager = new EventsStreamManager();

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });
  manager.handleRequest(req);

  assertEquals(manager.getStats().connectedClients, 1);

  manager.close();

  assertEquals(manager.getStats().connectedClients, 0);
});

// Story 6.5: Filter tests
Deno.test("EventsStreamManager - filter parameter parsing", () => {
  const manager = new EventsStreamManager();

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream?filter=dag.*,algorithm.*", {
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.status, 200);

  manager.close();
});

Deno.test("EventsStreamManager - subscribes to EventBus", async () => {
  const manager = new EventsStreamManager({
    maxClients: 10,
    heartbeatIntervalMs: 60000,
    corsOrigins: ["*"],
  });

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.status, 200);

  // Give time for connected event to be sent
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Emit an event via EventBus - it should be received by the manager
  eventBus.emit({
    type: "tool.start",
    source: "test",
    payload: { tool_id: "test:tool", traceId: "123" },
  });

  // Give time for event to propagate
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Manager should still have 1 client
  assertEquals(manager.getStats().connectedClients, 1);

  manager.close();
});
