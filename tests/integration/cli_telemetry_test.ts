/**
 * Integration Tests for CLI Telemetry Flags
 *
 * Tests AC7: --telemetry and --no-telemetry CLI flags
 */

import { assertEquals, assertExists } from "@std/assert";
import { parse as parseYaml } from "@std/yaml";

Deno.test({
  name: "AC7: --telemetry flag enables telemetry and updates config",
  sanitizeResources: false,
  async fn() {
    // Override HOME to use test config location
    const originalHome = Deno.env.get("HOME");
    const testHome = `/tmp/cai-test-home-${Date.now()}`;
    Deno.env.set("HOME", testHome);

    try {
      // Create test home directory
      await Deno.mkdir(testHome, { recursive: true });
      await Deno.mkdir(`${testHome}/.cai`, { recursive: true });

      // Run CLI with --telemetry flag
      const process = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-all",
          "src/main.ts",
          "--telemetry",
          "--help", // Add help to avoid waiting for subcommand
        ],
        stdout: "piped",
        stderr: "piped",
        cwd: "/home/ubuntu/CascadeProjects/AgentCards",
      });

      const { stdout, stderr } = await process.output();
      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      // Should see telemetry enabled message
      assertEquals(
        output.includes("✓ Telemetry enabled") || errorOutput.includes("✓ Telemetry enabled"),
        true,
        `Expected telemetry enabled message. Output: ${output}${errorOutput}`,
      );

      // Verify config file was created with telemetry enabled
      const configPath = `${testHome}/.cai/config.yaml`;
      const configText = await Deno.readTextFile(configPath);
      const config = parseYaml(configText) as Record<string, unknown>;

      assertExists(config.telemetry);
      assertEquals((config.telemetry as any).enabled, true);
    } finally {
      // Cleanup
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      } else {
        Deno.env.delete("HOME");
      }

      // Clean up test files
      try {
        await Deno.remove(testHome, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

Deno.test({
  name: "AC7: --no-telemetry flag disables telemetry and updates config",
  sanitizeResources: false,
  async fn() {
    const originalHome = Deno.env.get("HOME");
    const testHome = `/tmp/cai-test-home-${Date.now()}`;
    Deno.env.set("HOME", testHome);

    try {
      // Create test home directory
      await Deno.mkdir(testHome, { recursive: true });
      await Deno.mkdir(`${testHome}/.cai`, { recursive: true });

      // Run CLI with --no-telemetry flag
      const process = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-all",
          "src/main.ts",
          "--no-telemetry",
          "--help", // Add help to avoid waiting for subcommand
        ],
        stdout: "piped",
        stderr: "piped",
        cwd: "/home/ubuntu/CascadeProjects/AgentCards",
      });

      const { stdout, stderr } = await process.output();
      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      // Should see telemetry disabled message
      assertEquals(
        output.includes("✓ Telemetry disabled") || errorOutput.includes("✓ Telemetry disabled"),
        true,
        `Expected telemetry disabled message. Output: ${output}${errorOutput}`,
      );

      // Verify config file was created with telemetry disabled
      const configPath = `${testHome}/.cai/config.yaml`;
      const configText = await Deno.readTextFile(configPath);
      const config = parseYaml(configText) as Record<string, unknown>;

      assertExists(config.telemetry);
      assertEquals((config.telemetry as any).enabled, false);
    } finally {
      // Cleanup
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      } else {
        Deno.env.delete("HOME");
      }

      // Clean up test files
      try {
        await Deno.remove(testHome, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

Deno.test({
  name: "AC7: No telemetry flags should not modify config",
  sanitizeResources: false,
  async fn() {
    const originalHome = Deno.env.get("HOME");
    const testHome = `/tmp/cai-test-home-${Date.now()}`;
    Deno.env.set("HOME", testHome);

    try {
      // Create test home directory
      await Deno.mkdir(testHome, { recursive: true });
      await Deno.mkdir(`${testHome}/.cai`, { recursive: true });

      // Run CLI without telemetry flags
      const process = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-all",
          "src/main.ts",
          "--help",
        ],
        stdout: "piped",
        stderr: "piped",
        cwd: "/home/ubuntu/CascadeProjects/AgentCards",
      });

      const { stdout, stderr } = await process.output();
      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      // Should NOT see telemetry messages
      assertEquals(
        output.includes("✓ Telemetry") || errorOutput.includes("✓ Telemetry"),
        false,
        "Should not show telemetry messages when flags not provided",
      );

      // Config file should not be created
      const configPath = `${testHome}/.cai/config.yaml`;
      try {
        await Deno.stat(configPath);
        assertEquals(false, true, "Config file should not exist");
      } catch (error) {
        // Expected - file should not exist
        assertEquals(error instanceof Deno.errors.NotFound, true);
      }
    } finally {
      // Cleanup
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      } else {
        Deno.env.delete("HOME");
      }

      // Clean up test files
      try {
        await Deno.remove(testHome, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});
