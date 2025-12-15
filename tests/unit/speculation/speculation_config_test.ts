/**
 * Speculation Config Tests
 *
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 * Tests for AC #1 (Configuration), AC #5 (Tests)
 *
 * @module tests/unit/speculation/speculation_config_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  ConfigValidationError,
  DEFAULT_FILE_CONFIG,
  loadSpeculationConfig,
  saveSpeculationConfig,
  toSpeculationConfig,
} from "../../../src/speculation/speculation-config-loader.ts";
import type { SpeculationFileConfig } from "../../../src/speculation/speculation-config-loader.ts";

// Test temp directory
const TEST_DIR = "./tests/unit/speculation/temp";

// Helper to create test config file
async function createTestConfig(config: Partial<SpeculationFileConfig>): Promise<string> {
  await Deno.mkdir(TEST_DIR, { recursive: true });
  const path = `${TEST_DIR}/test_config_${Date.now()}.yaml`;

  const fullConfig = {
    enabled: config.enabled ?? true,
    confidence_threshold: config.confidence_threshold ?? 0.70,
    max_concurrent_speculations: config.max_concurrent_speculations ?? 3,
    speculation_timeout: config.speculation_timeout ?? 10000,
    adaptive: {
      enabled: config.adaptive?.enabled ?? true,
      min_threshold: config.adaptive?.min_threshold ?? 0.40,
      max_threshold: config.adaptive?.max_threshold ?? 0.90,
    },
  };

  const yamlContent = `
enabled: ${fullConfig.enabled}
confidence_threshold: ${fullConfig.confidence_threshold}
max_concurrent_speculations: ${fullConfig.max_concurrent_speculations}
speculation_timeout: ${fullConfig.speculation_timeout}
adaptive:
  enabled: ${fullConfig.adaptive.enabled}
  min_threshold: ${fullConfig.adaptive.min_threshold}
  max_threshold: ${fullConfig.adaptive.max_threshold}
`;

  await Deno.writeTextFile(path, yamlContent);
  return path;
}

// Helper to cleanup test files
async function cleanupTestFiles(): Promise<void> {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// === Config Loading Tests ===

Deno.test("SpeculationConfigLoader: loads valid config file (AC #1)", async () => {
  const path = await createTestConfig({
    enabled: true,
    confidence_threshold: 0.75,
    max_concurrent_speculations: 5,
    speculation_timeout: 15000,
  });

  try {
    const config = await loadSpeculationConfig(path);
    assertEquals(config.enabled, true);
    assertEquals(config.confidence_threshold, 0.75);
    assertEquals(config.max_concurrent_speculations, 5);
    assertEquals(config.speculation_timeout, 15000);
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: returns defaults for missing file (AC #1)", async () => {
  const config = await loadSpeculationConfig("./nonexistent/config.yaml");
  assertEquals(config.enabled, DEFAULT_FILE_CONFIG.enabled);
  assertEquals(config.confidence_threshold, DEFAULT_FILE_CONFIG.confidence_threshold);
  assertEquals(config.max_concurrent_speculations, DEFAULT_FILE_CONFIG.max_concurrent_speculations);
});

Deno.test("SpeculationConfigLoader: merges partial config with defaults (AC #1)", async () => {
  await Deno.mkdir(TEST_DIR, { recursive: true });
  const path = `${TEST_DIR}/partial_config_${Date.now()}.yaml`;

  // Partial config - only has enabled and threshold
  const yamlContent = `
enabled: false
confidence_threshold: 0.80
`;
  await Deno.writeTextFile(path, yamlContent);

  try {
    const config = await loadSpeculationConfig(path);
    assertEquals(config.enabled, false);
    assertEquals(config.confidence_threshold, 0.80);
    // Should use defaults for missing fields
    assertEquals(
      config.max_concurrent_speculations,
      DEFAULT_FILE_CONFIG.max_concurrent_speculations,
    );
    assertEquals(config.speculation_timeout, DEFAULT_FILE_CONFIG.speculation_timeout);
  } finally {
    await cleanupTestFiles();
  }
});

// === Validation Tests ===

Deno.test("SpeculationConfigLoader: rejects threshold below min (0.40) (AC #1)", async () => {
  const path = await createTestConfig({
    confidence_threshold: 0.30, // Below 0.40 min
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "confidence_threshold",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects threshold above max (0.90) (AC #1)", async () => {
  const path = await createTestConfig({
    confidence_threshold: 0.95, // Above 0.90 max
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "confidence_threshold",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects timeout <= 0 (AC #1)", async () => {
  const path = await createTestConfig({
    speculation_timeout: 0,
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "speculation_timeout",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects negative timeout (AC #1)", async () => {
  const path = await createTestConfig({
    speculation_timeout: -1000,
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "speculation_timeout",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects max_concurrent < 1 (AC #1)", async () => {
  const path = await createTestConfig({
    max_concurrent_speculations: 0,
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "max_concurrent_speculations",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects max_concurrent > 10 (AC #1)", async () => {
  const path = await createTestConfig({
    max_concurrent_speculations: 15,
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "max_concurrent_speculations",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects min_threshold >= max_threshold (AC #1)", async () => {
  const path = await createTestConfig({
    adaptive: {
      enabled: true,
      min_threshold: 0.90,
      max_threshold: 0.70, // min >= max is invalid
    },
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "min_threshold",
    );
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("SpeculationConfigLoader: rejects threshold outside adaptive bounds (AC #1)", async () => {
  const path = await createTestConfig({
    confidence_threshold: 0.50, // Within global bounds but...
    adaptive: {
      enabled: true,
      min_threshold: 0.60, // ...outside adaptive range
      max_threshold: 0.80,
    },
  });

  try {
    await assertRejects(
      () => loadSpeculationConfig(path),
      ConfigValidationError,
      "confidence_threshold",
    );
  } finally {
    await cleanupTestFiles();
  }
});

// === Save Config Tests ===

Deno.test("SpeculationConfigLoader: saves and reloads config correctly (AC #1)", async () => {
  await Deno.mkdir(TEST_DIR, { recursive: true });
  const path = `${TEST_DIR}/save_test_${Date.now()}.yaml`;

  const config: SpeculationFileConfig = {
    enabled: false,
    confidence_threshold: 0.65,
    max_concurrent_speculations: 2,
    speculation_timeout: 20000,
    adaptive: {
      enabled: false,
      min_threshold: 0.50,
      max_threshold: 0.85,
    },
  };

  try {
    await saveSpeculationConfig(config, path);
    const loaded = await loadSpeculationConfig(path);

    assertEquals(loaded.enabled, config.enabled);
    assertEquals(loaded.confidence_threshold, config.confidence_threshold);
    assertEquals(loaded.max_concurrent_speculations, config.max_concurrent_speculations);
    assertEquals(loaded.speculation_timeout, config.speculation_timeout);
    assertEquals(loaded.adaptive.enabled, config.adaptive.enabled);
  } finally {
    await cleanupTestFiles();
  }
});

// === toSpeculationConfig Tests ===

Deno.test("SpeculationConfigLoader: toSpeculationConfig converts correctly", () => {
  const fileConfig: SpeculationFileConfig = {
    enabled: true,
    confidence_threshold: 0.75,
    max_concurrent_speculations: 4,
    speculation_timeout: 15000,
    adaptive: {
      enabled: true,
      min_threshold: 0.40,
      max_threshold: 0.90,
    },
  };

  const specConfig = toSpeculationConfig(fileConfig);

  assertEquals(specConfig.enabled, true);
  assertEquals(specConfig.confidenceThreshold, 0.75);
  assertEquals(specConfig.maxConcurrent, 4);
});

// === Default Values Tests ===

Deno.test("SpeculationConfigLoader: default threshold is 0.70 (ADR-006)", () => {
  assertEquals(DEFAULT_FILE_CONFIG.confidence_threshold, 0.70);
});

Deno.test("SpeculationConfigLoader: default adaptive min is 0.40 (ADR-006)", () => {
  assertEquals(DEFAULT_FILE_CONFIG.adaptive.min_threshold, 0.40);
});

Deno.test("SpeculationConfigLoader: default adaptive max is 0.90 (ADR-006)", () => {
  assertEquals(DEFAULT_FILE_CONFIG.adaptive.max_threshold, 0.90);
});

Deno.test("SpeculationConfigLoader: default max_concurrent is 3", () => {
  assertEquals(DEFAULT_FILE_CONFIG.max_concurrent_speculations, 3);
});
