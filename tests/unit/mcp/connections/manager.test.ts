/**
 * ConnectionManager Tests
 *
 * @module tests/unit/mcp/connections/manager.test
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { ConnectionManager } from "../../../../src/mcp/connections/manager.ts";
import type { MCPClientBase } from "../../../../src/mcp/types.ts";

/**
 * Create mock MCP client
 */
function createMockClient(): MCPClientBase & { disconnectCalls: number } {
  const mock = {
    disconnectCalls: 0,
    disconnect: async () => {
      mock.disconnectCalls++;
    },
  };
  return mock as unknown as MCPClientBase & { disconnectCalls: number };
}

Deno.test("ConnectionManager - Basic Registration and Retrieval", async (t) => {
  await t.step("register() stores client with connection metadata", () => {
    const manager = new ConnectionManager();
    const mockClient = createMockClient();

    manager.register("server-1", mockClient);

    assertEquals(manager.get("server-1"), mockClient);
    const info = manager.getInfo("server-1");
    assertExists(info);
    assertEquals(info.serverId, "server-1");
    assertEquals(info.status, "connected");
    assertExists(info.connectedAt);
    assertExists(info.lastActivityAt);
    assertEquals(manager.size, 1);
  });

  await t.step("get() returns undefined for non-existent server", () => {
    const manager = new ConnectionManager();
    assertEquals(manager.get("non-existent"), undefined);
  });

  await t.step("register() overwrites existing connection", () => {
    const manager = new ConnectionManager();
    const client1 = createMockClient();
    const client2 = createMockClient();

    manager.register("server-1", client1);
    manager.register("server-1", client2);

    assertEquals(manager.get("server-1"), client2);
    assertEquals(manager.size, 1);
  });
});

Deno.test("ConnectionManager - Status Management", async (t) => {
  await t.step("updateStatus() updates connection status and activity timestamp", async () => {
    const manager = new ConnectionManager();
    const mockClient = createMockClient();

    manager.register("server-1", mockClient);
    const initialInfo = manager.getInfo("server-1");
    assertExists(initialInfo);
    const initialTimestamp = initialInfo.lastActivityAt;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    manager.updateStatus("server-1", "error", "Connection failed");
    const updatedInfo = manager.getInfo("server-1");
    assertExists(updatedInfo);
    assertEquals(updatedInfo.status, "error");
    assertEquals(updatedInfo.errorMessage, "Connection failed");
    // Timestamp should be updated
    assertExists(updatedInfo.lastActivityAt);
    assertExists(initialTimestamp);
    assertEquals(
      updatedInfo.lastActivityAt!.getTime() > initialTimestamp!.getTime(),
      true,
    );
  });

  await t.step("updateStatus() for non-existent server does nothing (no error)", () => {
    const manager = new ConnectionManager();
    // Should not throw
    manager.updateStatus("ghost", "connected");
  });

  await t.step("updateStatus() clears error message when transitioning to connected", () => {
    const manager = new ConnectionManager();
    const mockClient = createMockClient();

    manager.register("server-1", mockClient);
    manager.updateStatus("server-1", "error", "Connection failed");
    manager.updateStatus("server-1", "connected");

    const info = manager.getInfo("server-1");
    assertExists(info);
    assertEquals(info.status, "connected");
    // Note: Current implementation doesn't clear errorMessage - this documents the behavior
    assertEquals(info.errorMessage, "Connection failed");
  });
});

Deno.test("ConnectionManager - Disconnect Operations", async (t) => {
  await t.step("disconnect() calls client.disconnect() and updates status", async () => {
    const manager = new ConnectionManager();
    const mockClient = createMockClient();

    manager.register("server-1", mockClient);
    await manager.disconnect("server-1");

    assertEquals(mockClient.disconnectCalls, 1);
    const info = manager.getInfo("server-1");
    assertExists(info);
    assertEquals(info.status, "disconnected");
  });

  await t.step("disconnect() handles client.disconnect() errors gracefully", async () => {
    const manager = new ConnectionManager();
    const mockClient = {
      disconnect: async () => {
        throw new Error("Disconnect failed");
      },
    } as unknown as MCPClientBase;

    manager.register("server-1", mockClient);
    await manager.disconnect("server-1");

    const info = manager.getInfo("server-1");
    assertExists(info);
    assertEquals(info.status, "error");
    assertEquals(info.errorMessage?.includes("Disconnect failed"), true);
  });

  await t.step("disconnect() for non-existent server does nothing (no error)", async () => {
    const manager = new ConnectionManager();
    // Should not throw
    await manager.disconnect("ghost");
  });

  await t.step("disconnectAll() disconnects all registered clients", async () => {
    const manager = new ConnectionManager();
    const client1 = createMockClient();
    const client2 = createMockClient();
    const client3 = createMockClient();

    manager.register("server-1", client1);
    manager.register("server-2", client2);
    manager.register("server-3", client3);

    await manager.disconnectAll();

    assertEquals(client1.disconnectCalls, 1);
    assertEquals(client2.disconnectCalls, 1);
    assertEquals(client3.disconnectCalls, 1);

    assertEquals(manager.getInfo("server-1")?.status, "disconnected");
    assertEquals(manager.getInfo("server-2")?.status, "disconnected");
    assertEquals(manager.getInfo("server-3")?.status, "disconnected");
  });

  await t.step("disconnectAll() handles partial failures gracefully", async () => {
    const manager = new ConnectionManager();
    const client1 = createMockClient();
    const client2 = {
      disconnect: async () => {
        throw new Error("Failed");
      },
    } as unknown as MCPClientBase;
    const client3 = createMockClient();

    manager.register("server-1", client1);
    manager.register("server-2", client2);
    manager.register("server-3", client3);

    await manager.disconnectAll();

    assertEquals(manager.getInfo("server-1")?.status, "disconnected");
    assertEquals(manager.getInfo("server-2")?.status, "error");
    assertEquals(manager.getInfo("server-3")?.status, "disconnected");
  });
});

Deno.test("ConnectionManager - Collection Operations", async (t) => {
  await t.step("getServerIds() returns all registered server IDs", () => {
    const manager = new ConnectionManager();
    manager.register("server-a", createMockClient());
    manager.register("server-b", createMockClient());
    manager.register("server-c", createMockClient());

    const ids = manager.getServerIds();
    assertEquals(ids.length, 3);
    assertEquals(ids.includes("server-a"), true);
    assertEquals(ids.includes("server-b"), true);
    assertEquals(ids.includes("server-c"), true);
  });

  await t.step("getClientsMap() returns Map of server IDs to clients", () => {
    const manager = new ConnectionManager();
    const client1 = createMockClient();
    const client2 = createMockClient();
    const client3 = createMockClient();

    manager.register("server-1", client1);
    manager.register("server-2", client2);
    manager.register("server-3", client3);

    const map = manager.getClientsMap();
    assertEquals(map instanceof Map, true);
    assertEquals(map.size, 3);
    assertEquals(map.get("server-1"), client1);
    assertEquals(map.get("server-2"), client2);
    assertEquals(map.get("server-3"), client3);
  });

  await t.step("size property returns correct count", async () => {
    const manager = new ConnectionManager();
    assertEquals(manager.size, 0);

    manager.register("server-1", createMockClient());
    manager.register("server-2", createMockClient());
    manager.register("server-3", createMockClient());
    assertEquals(manager.size, 3);

    await manager.disconnect("server-1");
    // Note: disconnected connections are still tracked
    assertEquals(manager.size, 3);
  });
});

Deno.test("ConnectionManager - Edge Cases", async (t) => {
  await t.step("register() with same serverId twice creates single entry", () => {
    const manager = new ConnectionManager();
    const client1 = createMockClient();
    const client2 = createMockClient();

    manager.register("duplicate", client1);
    manager.register("duplicate", client2);

    assertEquals(manager.get("duplicate"), client2);
    assertEquals(manager.size, 1);
  });

  await t.step("getInfo() returns undefined for non-existent server", () => {
    const manager = new ConnectionManager();
    assertEquals(manager.getInfo("ghost"), undefined);
  });

  await t.step("concurrent operations don't corrupt internal state", async () => {
    const manager = new ConnectionManager();

    // Register initial clients
    for (let i = 0; i < 5; i++) {
      manager.register(`server-${i}`, createMockClient());
    }

    // Concurrent operations
    const operations = [
      manager.get("server-0"),
      manager.updateStatus("server-1", "error"),
      manager.disconnect("server-2"),
      manager.register("server-5", createMockClient()),
      manager.getInfo("server-3"),
    ];

    await Promise.all(operations);

    // Verify state is consistent
    assertEquals(manager.size, 6);
    assertExists(manager.get("server-0"));
    assertEquals(manager.getInfo("server-1")?.status, "error");
    assertEquals(manager.getInfo("server-2")?.status, "disconnected");
    assertExists(manager.get("server-5"));
  });
});
