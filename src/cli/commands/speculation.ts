/**
 * Speculation Command (Story 3.5-2)
 *
 * CLI commands to manage speculation configuration and view statistics.
 *
 * @module cli/commands/speculation
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import {
  ConfigValidationError,
  DEFAULT_SPECULATION_CONFIG_PATH,
  loadSpeculationConfig,
  saveSpeculationConfig,
} from "../../speculation/speculation-config-loader.ts";
import type { SpeculationFileConfig } from "../../speculation/speculation-config-loader.ts";
import { SpeculationManager } from "../../speculation/speculation-manager.ts";

// Singleton manager for metrics (in-memory for CLI session)
let speculationManager: SpeculationManager | null = null;

/**
 * Get or create SpeculationManager instance
 */
function getManager(): SpeculationManager {
  if (!speculationManager) {
    speculationManager = new SpeculationManager();
  }
  return speculationManager;
}

/**
 * Create speculation command group
 *
 * Usage:
 *   cai speculation config                    # Show current config
 *   cai speculation config --threshold 0.75   # Update threshold
 *   cai speculation config --enable           # Enable speculation
 *   cai speculation config --disable          # Disable speculation
 *   cai speculation config --timeout 15000    # Set timeout
 *   cai speculation stats                     # Show metrics
 *   cai speculation stats --json              # JSON output
 *   cai speculation stats --reset             # Reset metrics
 */
export function createSpeculationCommand() {
  return new Command()
    .name("speculation")
    .description("Manage speculation configuration and view statistics (Story 3.5-2)")
    .command("config", createConfigSubcommand())
    .command("stats", createStatsSubcommand());
}

/**
 * Create config subcommand
 *
 * Shows or modifies speculation configuration.
 */
function createConfigSubcommand() {
  return new Command()
    .name("config")
    .description("View or modify speculation configuration")
    .option(
      "--file <path:string>",
      "Path to speculation config YAML",
      { default: DEFAULT_SPECULATION_CONFIG_PATH },
    )
    .option(
      "--threshold <value:number>",
      "Set confidence threshold (0.40-0.90)",
    )
    .option(
      "--enable",
      "Enable speculation",
    )
    .option(
      "--disable",
      "Disable speculation",
    )
    .option(
      "--timeout <ms:number>",
      "Set speculation timeout in milliseconds",
    )
    .option(
      "--max-concurrent <count:number>",
      "Set maximum concurrent speculations",
    )
    .option(
      "--adaptive",
      "Enable adaptive threshold learning",
    )
    .option(
      "--no-adaptive",
      "Disable adaptive threshold learning",
    )
    .action(async (options) => {
      try {
        // Load current config
        let config: SpeculationFileConfig;
        try {
          config = await loadSpeculationConfig(options.file);
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            console.log(`ℹ️  Config file not found at ${options.file}`);
            console.log("   Creating with default values...\n");
            config = await loadSpeculationConfig(); // Uses defaults
          } else {
            throw error;
          }
        }

        // Check if any modifications requested
        const hasModifications = options.threshold !== undefined ||
          options.enable !== undefined ||
          options.disable !== undefined ||
          options.timeout !== undefined ||
          options.maxConcurrent !== undefined ||
          options.adaptive !== undefined;

        if (hasModifications) {
          // Apply modifications
          if (options.enable) {
            config.enabled = true;
          }
          if (options.disable) {
            config.enabled = false;
          }
          if (options.threshold !== undefined) {
            config.confidence_threshold = options.threshold;
          }
          if (options.timeout !== undefined) {
            config.speculation_timeout = options.timeout;
          }
          if (options.maxConcurrent !== undefined) {
            config.max_concurrent_speculations = options.maxConcurrent;
          }
          if (options.adaptive !== undefined) {
            config.adaptive.enabled = options.adaptive;
          }

          // Save updated config
          await saveSpeculationConfig(config, options.file);
          console.log("✅ Configuration updated successfully!\n");
        }

        // Display current config
        displayConfig(config);
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          console.error(`\n❌ Configuration error: ${error.message}`);
          console.error(`   Field: ${error.field}`);
          console.error(`   Value: ${error.value}`);
          Deno.exit(1);
        }
        log.error(`❌ Config command failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Display configuration in readable format
 */
function displayConfig(config: SpeculationFileConfig): void {
  console.log("📋 Speculation Configuration:\n");
  console.log(`   Enabled:            ${config.enabled ? "✅ Yes" : "❌ No"}`);
  console.log(`   Confidence Threshold: ${config.confidence_threshold.toFixed(2)}`);
  console.log(`   Max Concurrent:     ${config.max_concurrent_speculations}`);
  console.log(`   Timeout:            ${config.speculation_timeout}ms`);
  console.log("");
  console.log("   Adaptive Settings:");
  console.log(`     Enabled:          ${config.adaptive.enabled ? "✅ Yes" : "❌ No"}`);
  console.log(`     Min Threshold:    ${config.adaptive.min_threshold.toFixed(2)}`);
  console.log(`     Max Threshold:    ${config.adaptive.max_threshold.toFixed(2)}`);

  // Show threshold behavior
  console.log("\n   📊 Threshold Behavior:");
  if (config.confidence_threshold < 0.70) {
    console.log("      Aggressive mode - More speculations, higher chance of misses");
  } else if (config.confidence_threshold > 0.85) {
    console.log("      Conservative mode - Fewer speculations, higher precision");
  } else {
    console.log("      Balanced mode - Default speculation behavior");
  }
}

/**
 * Create stats subcommand
 *
 * Shows speculation metrics and statistics.
 */
function createStatsSubcommand() {
  return new Command()
    .name("stats")
    .description("View speculation statistics and metrics")
    .option(
      "--json",
      "Output in JSON format",
    )
    .option(
      "--reset",
      "Reset all metrics to zero",
    )
    .action(async (options) => {
      try {
        const manager = getManager();

        if (options.reset) {
          manager.resetMetrics();
          console.log("✅ Metrics reset successfully!\n");
        }

        const metrics = manager.getMetrics();

        if (options.json) {
          // JSON output
          console.log(JSON.stringify(metrics, null, 2));
        } else {
          // Human-readable output
          displayStats(metrics, manager.getConfig());
        }
      } catch (error) {
        log.error(`❌ Stats command failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Display metrics in human-readable format
 */
function displayStats(
  metrics: {
    hitRate: number;
    netBenefitMs: number;
    falsePositiveRate: number;
    totalSpeculations: number;
    totalHits: number;
    totalMisses: number;
  },
  config: { enabled: boolean; confidenceThreshold: number; maxConcurrent: number },
): void {
  console.log("📊 Speculation Statistics:\n");

  // Status
  console.log(`   Status:             ${config.enabled ? "🟢 Active" : "🔴 Disabled"}`);
  console.log(`   Current Threshold:  ${config.confidenceThreshold.toFixed(2)}`);
  console.log("");

  // Core metrics
  console.log("   Execution Metrics:");
  console.log(`     Total Speculations: ${metrics.totalSpeculations}`);
  console.log(`     Hits:               ${metrics.totalHits}`);
  console.log(`     Misses:             ${metrics.totalMisses}`);
  console.log("");

  // Rates
  console.log("   Performance:");
  console.log(`     Hit Rate:           ${(metrics.hitRate * 100).toFixed(1)}%`);
  console.log(`     False Positive Rate: ${(metrics.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`     Net Benefit:        ${metrics.netBenefitMs.toFixed(0)}ms`);

  // Interpretation
  console.log("\n   📈 Analysis:");
  if (metrics.totalSpeculations === 0) {
    console.log("      No speculations recorded yet.");
  } else if (metrics.hitRate >= 0.8) {
    console.log("      🌟 Excellent hit rate! Speculation is highly effective.");
  } else if (metrics.hitRate >= 0.6) {
    console.log("      ✅ Good hit rate. Speculation is providing value.");
  } else if (metrics.hitRate >= 0.4) {
    console.log("      ⚠️  Moderate hit rate. Consider raising threshold.");
  } else {
    console.log("      ❌ Low hit rate. Consider raising threshold significantly.");
  }

  if (metrics.netBenefitMs > 0) {
    console.log(`      💰 Net time saved: ${metrics.netBenefitMs.toFixed(0)}ms`);
  } else if (metrics.netBenefitMs < 0) {
    console.log(
      `      ⚠️  Net time lost: ${
        Math.abs(metrics.netBenefitMs).toFixed(0)
      }ms (consider raising threshold)`,
    );
  }
}
