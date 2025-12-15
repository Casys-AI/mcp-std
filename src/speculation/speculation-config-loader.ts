/**
 * Speculation Config Loader
 *
 * Loads and validates speculation configuration from YAML file.
 * Merges with DEFAULT_SPECULATION_CONFIG as fallback.
 *
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 *
 * @module speculation/speculation-config-loader
 */

import * as log from "@std/log";
import { parse } from "@std/yaml";
import { DEFAULT_SPECULATION_CONFIG } from "./speculation-manager.ts";
import type { SpeculationConfig } from "../graphrag/types.ts";

/**
 * Extended config for YAML file (includes adaptive and timeout settings)
 */
export interface SpeculationFileConfig {
  enabled: boolean;
  confidence_threshold: number;
  max_concurrent_speculations: number;
  speculation_timeout: number;
  adaptive: {
    enabled: boolean;
    min_threshold: number;
    max_threshold: number;
  };
}

/**
 * Default file path for speculation config
 */
export const DEFAULT_SPECULATION_CONFIG_PATH = "./config/speculation_config.yaml";

/**
 * Validation constraints (ADR-006)
 */
const VALIDATION_CONSTRAINTS = {
  MIN_THRESHOLD: 0.40,
  MAX_THRESHOLD: 0.90,
  MIN_TIMEOUT: 1,
  MAX_TIMEOUT: 300000, // 5 minutes max
  MIN_CONCURRENT: 1,
  MAX_CONCURRENT: 10,
};

/**
 * Default extended config with timeout and adaptive settings
 */
export const DEFAULT_FILE_CONFIG: SpeculationFileConfig = {
  enabled: DEFAULT_SPECULATION_CONFIG.enabled,
  confidence_threshold: DEFAULT_SPECULATION_CONFIG.confidenceThreshold,
  max_concurrent_speculations: DEFAULT_SPECULATION_CONFIG.maxConcurrent,
  speculation_timeout: 10000,
  adaptive: {
    enabled: true,
    min_threshold: VALIDATION_CONSTRAINTS.MIN_THRESHOLD,
    max_threshold: VALIDATION_CONSTRAINTS.MAX_THRESHOLD,
  },
};

/**
 * Validation error for config
 */
export class ConfigValidationError extends Error {
  constructor(
    public field: string,
    public value: unknown,
    public constraint: string,
  ) {
    super(`Invalid config value for ${field}: ${value}. ${constraint}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Load speculation configuration from YAML file
 *
 * @param configPath - Path to YAML config file
 * @returns Loaded and validated configuration
 * @throws ConfigValidationError if validation fails
 */
export async function loadSpeculationConfig(
  configPath: string = DEFAULT_SPECULATION_CONFIG_PATH,
): Promise<SpeculationFileConfig> {
  try {
    const content = await Deno.readTextFile(configPath);
    const parsed = parse(content) as Partial<SpeculationFileConfig>;

    // Merge with defaults
    const config = mergeWithDefaults(parsed);

    // Validate
    validateConfig(config);

    log.info(`[SpeculationConfigLoader] Loaded config from ${configPath}`);
    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      log.warn(
        `[SpeculationConfigLoader] Config file not found at ${configPath}, using defaults`,
      );
      return { ...DEFAULT_FILE_CONFIG };
    }
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    log.error(`[SpeculationConfigLoader] Failed to load config: ${error}`);
    throw error;
  }
}

/**
 * Merge partial config with defaults
 *
 * @param partial - Partial configuration from YAML
 * @returns Complete configuration with defaults filled in
 */
function mergeWithDefaults(
  partial: Partial<SpeculationFileConfig>,
): SpeculationFileConfig {
  return {
    enabled: partial.enabled ?? DEFAULT_FILE_CONFIG.enabled,
    confidence_threshold: partial.confidence_threshold ??
      DEFAULT_FILE_CONFIG.confidence_threshold,
    max_concurrent_speculations: partial.max_concurrent_speculations ??
      DEFAULT_FILE_CONFIG.max_concurrent_speculations,
    speculation_timeout: partial.speculation_timeout ??
      DEFAULT_FILE_CONFIG.speculation_timeout,
    adaptive: {
      enabled: partial.adaptive?.enabled ?? DEFAULT_FILE_CONFIG.adaptive.enabled,
      min_threshold: partial.adaptive?.min_threshold ??
        DEFAULT_FILE_CONFIG.adaptive.min_threshold,
      max_threshold: partial.adaptive?.max_threshold ??
        DEFAULT_FILE_CONFIG.adaptive.max_threshold,
    },
  };
}

/**
 * Validate configuration values
 *
 * @param config - Configuration to validate
 * @throws ConfigValidationError if validation fails
 */
function validateConfig(config: SpeculationFileConfig): void {
  // Validate confidence_threshold
  if (
    config.confidence_threshold < VALIDATION_CONSTRAINTS.MIN_THRESHOLD ||
    config.confidence_threshold > VALIDATION_CONSTRAINTS.MAX_THRESHOLD
  ) {
    throw new ConfigValidationError(
      "confidence_threshold",
      config.confidence_threshold,
      `Must be between ${VALIDATION_CONSTRAINTS.MIN_THRESHOLD} and ${VALIDATION_CONSTRAINTS.MAX_THRESHOLD}`,
    );
  }

  // Validate speculation_timeout
  if (
    config.speculation_timeout < VALIDATION_CONSTRAINTS.MIN_TIMEOUT ||
    config.speculation_timeout > VALIDATION_CONSTRAINTS.MAX_TIMEOUT
  ) {
    throw new ConfigValidationError(
      "speculation_timeout",
      config.speculation_timeout,
      `Must be between ${VALIDATION_CONSTRAINTS.MIN_TIMEOUT} and ${VALIDATION_CONSTRAINTS.MAX_TIMEOUT}ms`,
    );
  }

  // Validate max_concurrent_speculations
  if (
    config.max_concurrent_speculations < VALIDATION_CONSTRAINTS.MIN_CONCURRENT ||
    config.max_concurrent_speculations > VALIDATION_CONSTRAINTS.MAX_CONCURRENT
  ) {
    throw new ConfigValidationError(
      "max_concurrent_speculations",
      config.max_concurrent_speculations,
      `Must be between ${VALIDATION_CONSTRAINTS.MIN_CONCURRENT} and ${VALIDATION_CONSTRAINTS.MAX_CONCURRENT}`,
    );
  }

  // Validate adaptive thresholds
  if (config.adaptive.enabled) {
    if (
      config.adaptive.min_threshold < VALIDATION_CONSTRAINTS.MIN_THRESHOLD ||
      config.adaptive.min_threshold > VALIDATION_CONSTRAINTS.MAX_THRESHOLD
    ) {
      throw new ConfigValidationError(
        "adaptive.min_threshold",
        config.adaptive.min_threshold,
        `Must be between ${VALIDATION_CONSTRAINTS.MIN_THRESHOLD} and ${VALIDATION_CONSTRAINTS.MAX_THRESHOLD}`,
      );
    }

    if (
      config.adaptive.max_threshold < VALIDATION_CONSTRAINTS.MIN_THRESHOLD ||
      config.adaptive.max_threshold > VALIDATION_CONSTRAINTS.MAX_THRESHOLD
    ) {
      throw new ConfigValidationError(
        "adaptive.max_threshold",
        config.adaptive.max_threshold,
        `Must be between ${VALIDATION_CONSTRAINTS.MIN_THRESHOLD} and ${VALIDATION_CONSTRAINTS.MAX_THRESHOLD}`,
      );
    }

    if (config.adaptive.min_threshold >= config.adaptive.max_threshold) {
      throw new ConfigValidationError(
        "adaptive.min_threshold",
        config.adaptive.min_threshold,
        `Must be less than adaptive.max_threshold (${config.adaptive.max_threshold})`,
      );
    }

    // Ensure confidence_threshold is within adaptive bounds
    if (
      config.confidence_threshold < config.adaptive.min_threshold ||
      config.confidence_threshold > config.adaptive.max_threshold
    ) {
      throw new ConfigValidationError(
        "confidence_threshold",
        config.confidence_threshold,
        `Must be within adaptive bounds [${config.adaptive.min_threshold}, ${config.adaptive.max_threshold}]`,
      );
    }
  }
}

/**
 * Convert file config to SpeculationConfig for SpeculationManager
 *
 * @param fileConfig - Extended file configuration
 * @returns SpeculationConfig for SpeculationManager
 */
export function toSpeculationConfig(
  fileConfig: SpeculationFileConfig,
): SpeculationConfig {
  return {
    enabled: fileConfig.enabled,
    confidenceThreshold: fileConfig.confidence_threshold,
    maxConcurrent: fileConfig.max_concurrent_speculations,
  };
}

/**
 * Save speculation configuration to YAML file
 *
 * @param config - Configuration to save
 * @param configPath - Path to YAML config file
 */
export async function saveSpeculationConfig(
  config: SpeculationFileConfig,
  configPath: string = DEFAULT_SPECULATION_CONFIG_PATH,
): Promise<void> {
  // Validate before saving
  validateConfig(config);

  const yamlContent = `# Speculation Configuration (Story 3.5-2)
#
# Controls for speculative execution behavior.
# See ADR-006 for architecture details.

# Enable/disable speculation globally
enabled: ${config.enabled}

# Minimum confidence for speculation (ADR-006 bounds: 0.40-0.90)
# Higher = more conservative (fewer speculations)
# Lower = more aggressive (more speculations)
confidence_threshold: ${config.confidence_threshold}

# Maximum concurrent speculations (resource limit)
# Prevents overwhelming sandbox with too many parallel executions
max_concurrent_speculations: ${config.max_concurrent_speculations}

# Speculation timeout in milliseconds
# Speculations exceeding this are terminated
speculation_timeout: ${config.speculation_timeout}

# Adaptive threshold settings
adaptive:
  # Enable auto-adjustment of threshold based on hit/miss ratio
  enabled: ${config.adaptive.enabled}
  # Minimum allowed threshold (ADR-006)
  min_threshold: ${config.adaptive.min_threshold}
  # Maximum allowed threshold (ADR-006)
  max_threshold: ${config.adaptive.max_threshold}
`;

  await Deno.writeTextFile(configPath, yamlContent);
  log.info(`[SpeculationConfigLoader] Saved config to ${configPath}`);
}
