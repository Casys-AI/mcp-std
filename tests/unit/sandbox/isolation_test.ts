/**
 * Security Isolation Tests
 *
 * Tests that the sandbox properly isolates code execution:
 * - Filesystem access denial (read/write)
 * - Network access denial
 * - Subprocess spawning denial
 * - FFI access denial
 * - Environment variable access denial
 *
 * These tests validate AC #3 and AC #8
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "Isolation - deny reading /etc/passwd",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const text = await Deno.readTextFile("/etc/passwd");
      return text;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
    // Should mention permission denial (message format varies between subprocess/Worker)
    assertEquals(
      result.error.message.toLowerCase().includes("permission") ||
        result.error.message.toLowerCase().includes("requires") ||
        result.error.message.includes("PermissionDenied") ||
        result.error.message.includes("NotCapable"),
      true,
    );
  },
});

Deno.test({
  name: "Isolation - deny reading arbitrary system file",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const text = await Deno.readTextFile("/etc/hosts");
      return text;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny reading home directory files",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const home = Deno.env.get("HOME") || "/home/test";
      const text = await Deno.readTextFile(home + "/.bashrc");
      return text;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    // Either PermissionError for file read or env access
    assertEquals(
      result.error.type === "PermissionError" || result.error.type === "RuntimeError",
      true,
    );
  },
});

Deno.test({
  name: "Isolation - deny path traversal attacks",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      // Try to escape via path traversal
      const text = await Deno.readTextFile("../../../../../../etc/passwd");
      return text;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny writing to /tmp",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      await Deno.writeTextFile("/tmp/test-sandbox-write.txt", "malicious data");
      return "written";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny writing to current directory",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      await Deno.writeTextFile("./malicious.txt", "malicious data");
      return "written";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny network access via fetch()",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const response = await fetch("https://example.com");
      return await response.text();
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny network access to localhost",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const response = await fetch("http://localhost:8080");
      return await response.text();
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny subprocess spawning",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const command = new Deno.Command("ls", { args: ["-la"] });
      const output = await command.output();
      return new TextDecoder().decode(output.stdout);
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny subprocess spawning with shell commands",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const command = new Deno.Command("sh", { args: ["-c", "echo 'malicious'"] });
      const output = await command.output();
      return new TextDecoder().decode(output.stdout);
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny environment variable access (read)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const home = Deno.env.get("HOME");
      return home;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny environment variable access (set)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      Deno.env.set("MALICIOUS", "value");
      return "set";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - deny FFI access",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      // Attempt to open FFI (will fail)
      const lib = Deno.dlopen("/lib/libc.so.6", {});
      return "opened";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});

Deno.test({
  name: "Isolation - allow reading with allowedReadPaths (subprocess only)",
  fn: async () => {
    // Note: allowedReadPaths only works with subprocess mode.
    // Worker mode uses permissions: "none" for 100% traceability (all I/O via MCP RPC).
    // This test uses useWorkerForExecute: false to test subprocess-specific feature.

    // Create a temp file to test allowed reads
    const tempDir = Deno.makeTempDirSync();
    const testFile = `${tempDir}/allowed-test.txt`;
    Deno.writeTextFileSync(testFile, "allowed content");

    try {
      const sandbox = new DenoSandboxExecutor({
        allowedReadPaths: [tempDir],
        useWorkerForExecute: false, // Subprocess mode for allowedReadPaths support
      });

      const code = `
        const text = await Deno.readTextFile("${testFile}");
        return text;
      `;
      const result = await sandbox.execute(code);

      assertEquals(result.success, true);
      assertEquals(result.result, "allowed content");
    } finally {
      // Cleanup
      try {
        Deno.removeSync(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

Deno.test({
  name: "Isolation - deny reading outside allowedReadPaths",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      allowedReadPaths: ["/tmp/allowed-dir"],
    });

    const code = `
      // Try to read outside allowed paths
      const text = await Deno.readTextFile("/etc/passwd");
      return text;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "PermissionError");
  },
});
