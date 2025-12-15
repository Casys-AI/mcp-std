#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

/**
 * LLM API Key Setup Script
 *
 * Interactive script to configure LLM API keys for the playground.
 * Supports: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
 *
 * Features:
 * - Auto-detects provider from key format
 * - Creates/updates .env file preserving existing variables
 * - Validates key with a simple API call
 * - Creates backup before modifications
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-env --allow-net scripts/setup-api-key.ts
 *   # Or directly:
 *   ./scripts/setup-api-key.ts
 *
 * Flags:
 *   --help, -h    Show this help message
 *   --skip-test   Skip API validation test
 */

import {
  detectProvider,
  generateCompletion,
  getDefaultModel,
  type LLMProvider,
} from "../lib/llm-provider.ts";

// =============================================================================
// Constants
// =============================================================================

const ENV_FILE_PATH = new URL("../.env", import.meta.url).pathname;
const ENV_BACKUP_PATH = new URL("../.env.backup", import.meta.url).pathname;
const API_TIMEOUT_MS = 30000;

const PROVIDER_ENV_VARS: Record<LLMProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

const PROVIDER_NAMES: Record<LLMProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Mask an API key for display (show only last 4 characters)
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${"*".repeat(key.length - 4)}${key.slice(-4)}`;
}

/**
 * Print colored output to console
 */
function print(message: string, type: "info" | "success" | "error" | "warning" = "info"): void {
  const colors = {
    info: "\x1b[36m", // Cyan
    success: "\x1b[32m", // Green
    error: "\x1b[31m", // Red
    warning: "\x1b[33m", // Yellow
  };
  const reset = "\x1b[0m";
  const icons = {
    info: "i",
    success: "✓",
    error: "✗",
    warning: "!",
  };

  console.log(`${colors[type]}[${icons[type]}]${reset} ${message}`);
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
LLM API Key Setup Script
=========================

Configure your LLM API key for the playground environment.

USAGE:
  deno run --allow-read --allow-write --allow-env --allow-net scripts/setup-api-key.ts [OPTIONS]

OPTIONS:
  --help, -h    Show this help message and exit
  --skip-test   Skip the API validation test

SUPPORTED PROVIDERS:
  - Anthropic (Claude): Keys starting with 'sk-ant-'
  - OpenAI (GPT):       Keys starting with 'sk-'
  - Google (Gemini):    Keys starting with 'AIza'

EXAMPLES:
  # Interactive setup
  ./scripts/setup-api-key.ts

  # Setup without API test
  ./scripts/setup-api-key.ts --skip-test

WHAT THIS SCRIPT DOES:
  1. Asks for your API key
  2. Auto-detects the provider from the key format
  3. Validates the key with a simple API call (unless --skip-test)
  4. Creates a backup of existing .env file
  5. Updates .env with the correct environment variable
`);
}

// =============================================================================
// .env File Management
// =============================================================================

/**
 * Parse .env file content into key-value pairs
 * Preserves comments and empty lines as special entries
 */
export function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments for parsing
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE (handle values with = signs)
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      env.set(key, value);
    }
  }

  return env;
}

/**
 * Read existing .env file
 */
async function readEnvFile(): Promise<{ content: string; exists: boolean }> {
  try {
    const content = await Deno.readTextFile(ENV_FILE_PATH);
    return { content, exists: true };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { content: "", exists: false };
    }
    throw error;
  }
}

/**
 * Create backup of existing .env file
 */
async function createBackup(): Promise<boolean> {
  try {
    const content = await Deno.readTextFile(ENV_FILE_PATH);
    await Deno.writeTextFile(ENV_BACKUP_PATH, content);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false; // No file to backup
    }
    throw error;
  }
}

/**
 * Build .env file content with updated API key
 * Preserves existing structure, comments, and other variables
 */
export function buildEnvContent(
  existingContent: string,
  provider: LLMProvider,
  apiKey: string,
): string {
  const envVar = PROVIDER_ENV_VARS[provider];
  const lines = existingContent.split("\n");
  let keyUpdated = false;

  // Update existing variable if found
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${envVar}=`) || trimmed === envVar) {
      keyUpdated = true;
      return `${envVar}=${apiKey}`;
    }
    return line;
  });

  // Add new variable if not found
  if (!keyUpdated) {
    // Find the right section (after similar provider keys)
    let insertIndex = -1;

    for (let i = 0; i < updatedLines.length; i++) {
      const line = updatedLines[i].trim();
      // Insert after other API key variables
      if (
        line.startsWith("ANTHROPIC_API_KEY=") ||
        line.startsWith("OPENAI_API_KEY=") ||
        line.startsWith("GOOGLE_API_KEY=")
      ) {
        insertIndex = i + 1;
      }
    }

    if (insertIndex >= 0) {
      updatedLines.splice(insertIndex, 0, `${envVar}=${apiKey}`);
    } else {
      // Add at beginning with a comment
      updatedLines.unshift(`${envVar}=${apiKey}`);
    }
  }

  return updatedLines.join("\n");
}

/**
 * Write .env file
 */
async function writeEnvFile(content: string): Promise<void> {
  await Deno.writeTextFile(ENV_FILE_PATH, content);
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detect provider with manual override option
 */
function detectProviderWithFallback(apiKey: string): LLMProvider | null {
  try {
    return detectProvider(apiKey);
  } catch {
    return null;
  }
}

/**
 * Ask user to select provider manually
 */
function askProviderManually(): LLMProvider | null {
  console.log("\nSelect your LLM provider:");
  console.log("  1. Anthropic (Claude)");
  console.log("  2. OpenAI (GPT)");
  console.log("  3. Google (Gemini)");
  console.log("  q. Cancel\n");

  const choice = prompt("Enter choice (1-3 or q):");

  switch (choice) {
    case "1":
      return "anthropic";
    case "2":
      return "openai";
    case "3":
      return "google";
    case "q":
    case null:
      return null;
    default:
      print("Invalid choice. Please enter 1, 2, 3, or q.", "error");
      return askProviderManually();
  }
}

// =============================================================================
// API Validation
// =============================================================================

/**
 * Parse error message and return user-friendly message with suggestions
 */
export function parseApiError(errorMessage: string): string {
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
    return "Authentication failed - API key is invalid or expired.\n   → Double-check your API key and try again.";
  }

  if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
    return "Rate limit exceeded - too many requests.\n   → Wait a few minutes and try again, or check your API quota.";
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("AbortError")) {
    return `Request timed out after ${
      API_TIMEOUT_MS / 1000
    }s.\n   → Check your network connection and try again.`;
  }

  if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("network")) {
    return "Network error - could not connect to API.\n   → Check your internet connection.";
  }

  return `API error: ${errorMessage}\n   → Verify your API key and provider settings.`;
}

/**
 * Test API key with a simple completion request
 */
export async function validateApiKey(
  apiKey: string,
  provider: LLMProvider,
): Promise<{ success: boolean; error?: string; response?: string }> {
  let timeoutId: number | undefined;

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("timeout"));
      }, API_TIMEOUT_MS);
    });

    // Race between the API call and timeout
    const apiPromise = generateCompletion(
      { apiKey, provider },
      "Say hello in one word",
      { maxTokens: 10 },
    );

    const result = await Promise.race([apiPromise, timeoutPromise]);

    return {
      success: true,
      response: result.text.trim(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: parseApiError(errorMessage),
    };
  } finally {
    // Always clear the timeout to prevent leaks
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// Main Flow
// =============================================================================

async function main(): Promise<void> {
  const args = Deno.args;

  // Handle --help flag
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    Deno.exit(0);
  }

  const skipTest = args.includes("--skip-test");

  console.log("\n" + "=".repeat(50));
  console.log("  LLM API Key Setup");
  console.log("=".repeat(50) + "\n");

  // Step 1: Get API key from user
  print("Enter your LLM API key (or 'q' to quit):", "info");
  const apiKey = prompt("API Key:");

  if (!apiKey || apiKey.toLowerCase() === "q") {
    print("Setup cancelled.", "warning");
    Deno.exit(0);
  }

  // Step 2: Detect provider
  print(`Key received: ${maskApiKey(apiKey)}`, "info");

  let provider = detectProviderWithFallback(apiKey);

  if (provider) {
    print(`Auto-detected provider: ${PROVIDER_NAMES[provider]}`, "success");
  } else {
    print("Could not auto-detect provider from key format.", "warning");
    provider = askProviderManually();

    if (!provider) {
      print("Setup cancelled.", "warning");
      Deno.exit(0);
    }
  }

  // Step 3: Validate API key (unless skipped)
  if (!skipTest) {
    print(`Testing API key with ${PROVIDER_NAMES[provider]}...`, "info");

    const validation = await validateApiKey(apiKey, provider);

    if (validation.success) {
      print(`API key is valid! Response: "${validation.response}"`, "success");
      print(`Provider: ${PROVIDER_NAMES[provider]}`, "info");
      print(`Model: ${getDefaultModel(provider)}`, "info");
    } else {
      print(`API validation failed:\n   ${validation.error}`, "error");

      const proceed = prompt("\nContinue anyway and save the key? (y/n):");
      if (proceed?.toLowerCase() !== "y") {
        print("Setup cancelled.", "warning");
        Deno.exit(1);
      }
    }
  } else {
    print("Skipping API validation (--skip-test flag)", "warning");
  }

  // Step 4: Read existing .env and create backup
  const { content: existingContent, exists: envExists } = await readEnvFile();

  if (envExists) {
    const backedUp = await createBackup();
    if (backedUp) {
      print("Created backup: .env.backup", "info");
    }
  }

  // Step 5: Update .env file
  const envVar = PROVIDER_ENV_VARS[provider];
  let newContent: string;

  if (envExists) {
    newContent = buildEnvContent(existingContent, provider, apiKey);
    print(`Updating .env with ${envVar}`, "info");
  } else {
    // Create new .env from template
    newContent = `# LLM API Keys
# Auto-generated by setup-api-key.ts

${envVar}=${apiKey}

# Server configuration (optional)
PORT=3000
SANDBOX_TIMEOUT_MS=30000
SANDBOX_MEMORY_LIMIT_MB=256
`;
    print("Creating new .env file", "info");
  }

  await writeEnvFile(newContent);

  // Step 6: Success message
  console.log("\n" + "=".repeat(50));
  print("Setup complete!", "success");
  console.log("=".repeat(50) + "\n");

  print(`Provider: ${PROVIDER_NAMES[provider]}`, "info");
  print(`Environment variable: ${envVar}`, "info");
  print(`Config file: ${ENV_FILE_PATH}`, "info");

  console.log("\nYou can now run notebooks that use LLM features.");
  console.log("To change providers, run this script again.\n");
}

// Run if executed directly
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    print(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, "error");
    Deno.exit(1);
  }
}
