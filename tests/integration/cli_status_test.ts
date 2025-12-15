/**
 * Integration Tests for CLI Status Command
 *
 * Tests AC6: cai status CLI command
 */

import { assert, assertEquals } from "@std/assert";

Deno.test({
  name: "AC6: cai status command is registered and shows help",
  sanitizeResources: false,
  async fn() {
    // Run CLI with status --help
    const process = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-all",
        "src/main.ts",
        "status",
        "--help",
      ],
      stdout: "piped",
      stderr: "piped",
      cwd: "/home/ubuntu/CascadeProjects/AgentCards",
    });

    const { stdout, stderr, code } = await process.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    // Command should succeed
    assertEquals(
      code,
      0,
      `Status help command failed. Error: ${errorOutput}`,
    );

    // Should show status command description
    assert(
      output.includes("Show health status of all MCP servers") ||
        output.includes("status"),
      `Expected status command description. Output: ${output}`,
    );

    // Should show --json option
    assert(
      output.includes("--json"),
      `Expected --json option. Output: ${output}`,
    );

    // Should show --watch option
    assert(
      output.includes("--watch"),
      `Expected --watch option. Output: ${output}`,
    );

    // Should show --config option
    assert(
      output.includes("--config"),
      `Expected --config option. Output: ${output}`,
    );
  },
});

Deno.test({
  name: "AC6: cai status fails gracefully when no config found",
  sanitizeResources: false,
  async fn() {
    // Override HOME to use non-existent test location
    const originalHome = Deno.env.get("HOME");
    const testHome = `/tmp/pml-test-no-config-${Date.now()}`;
    Deno.env.set("HOME", testHome);

    try {
      // Run CLI with status command (no config exists)
      const process = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-all",
          "src/main.ts",
          "status",
        ],
        stdout: "piped",
        stderr: "piped",
        cwd: "/home/ubuntu/CascadeProjects/AgentCards",
      });

      const { stderr, code } = await process.output();
      const errorOutput = new TextDecoder().decode(stderr);

      // Should fail with non-zero exit code
      assertEquals(
        code,
        1,
        "Status command should fail when no config is found",
      );

      // Should show helpful error message
      assert(
        errorOutput.includes("No config file found") ||
          errorOutput.includes("agentcards init"),
        `Expected helpful error message. Error: ${errorOutput}`,
      );
    } finally {
      // Restore HOME
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      } else {
        Deno.env.delete("HOME");
      }
    }
  },
});
