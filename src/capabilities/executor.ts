/**
 * Capability Executor (Story 7.3b)
 *
 * Orchestrates the capability injection flow:
 * Intent → CapabilityMatcher → CodeGenerator → WorkerBridge
 *
 * This is the main entry point for capability-based code execution.
 *
 * @module capabilities/executor
 */

import type { CapabilityMatcher } from "./matcher.ts";
import { CapabilityCodeGenerator } from "./code-generator.ts";
import type { Capability, CapabilityMatch } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * CapabilityExecutor - Orchestrates capability matching and injection
 *
 * Provides a high-level API for:
 * 1. Finding capabilities matching an intent
 * 2. Generating capability context code for injection
 * 3. Preparing execution with matched capabilities
 *
 * @example
 * ```typescript
 * const executor = new CapabilityExecutor(matcher);
 *
 * // Prepare capability context for an intent
 * const result = await executor.prepareCapabilityContext("deploy to production");
 * if (result) {
 *   // Use result.capabilityContext with WorkerBridge.execute()
 *   const execResult = await bridge.execute(code, tools, context, result.capabilityContext);
 * }
 * ```
 */
export class CapabilityExecutor {
  private codeGenerator: CapabilityCodeGenerator;

  constructor(private matcher: CapabilityMatcher) {
    this.codeGenerator = new CapabilityCodeGenerator();
    logger.debug("CapabilityExecutor initialized");
  }

  /**
   * Prepare capability context for an intent
   *
   * Finds matching capabilities and generates injection code.
   *
   * @param intent - Natural language intent
   * @returns Capability context or undefined if no match
   */
  async prepareCapabilityContext(intent: string): Promise<
    | {
      capabilityContext: string;
      match: CapabilityMatch;
      capabilities: Capability[];
    }
    | undefined
  > {
    // 1. Find matching capability
    const match = await this.matcher.findMatch(intent);

    if (!match) {
      logger.debug("No capability match for intent", { intent: intent.substring(0, 50) });
      return undefined;
    }

    // 2. Generate capability context code
    const capabilities = [match.capability];
    const capabilityContext = this.codeGenerator.buildCapabilitiesObject(capabilities);

    logger.info("Capability context prepared", {
      intent: intent.substring(0, 50),
      capabilityId: match.capability.id,
      score: match.score.toFixed(2),
    });

    return {
      capabilityContext,
      match,
      capabilities,
    };
  }

  /**
   * Prepare capability context for multiple capabilities
   *
   * Use this when you already have capabilities to inject (not from matching).
   *
   * @param capabilities - Array of capabilities to inject
   * @returns Capability context code string
   */
  prepareContextForCapabilities(capabilities: Capability[]): string {
    return this.codeGenerator.buildCapabilitiesObject(capabilities);
  }

  /**
   * Find matching capability without generating context
   *
   * Use this for inspection/debugging or when you need more control.
   *
   * @param intent - Natural language intent
   * @returns CapabilityMatch or null
   */
  async findMatch(intent: string): Promise<CapabilityMatch | null> {
    return this.matcher.findMatch(intent);
  }
}
