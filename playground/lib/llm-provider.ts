/**
 * Multi-LLM Provider Abstraction
 *
 * Supports: OpenAI, Anthropic, Google Gemini via AI SDK
 * Auto-detects provider from API key or explicit config
 */

import { createAnthropic } from "npm:@ai-sdk/anthropic@0.0.39";
import { createOpenAI } from "npm:@ai-sdk/openai@0.0.42";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@0.0.35";
import { generateText } from "npm:ai@3.3.27";

export type LLMProvider = "openai" | "anthropic" | "google";

export interface LLMConfig {
  provider?: LLMProvider;
  apiKey: string;
  model?: string;
}

/**
 * Auto-detect provider from API key format
 */
export function detectProvider(apiKey: string): LLMProvider {
  if (apiKey.startsWith("sk-ant-")) return "anthropic";
  if (apiKey.startsWith("sk-")) return "openai";
  if (apiKey.startsWith("AIza")) return "google";

  throw new Error("Unable to detect provider from API key format");
}

/**
 * Get default model for provider
 */
export function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4-turbo-preview";
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    case "google":
      return "gemini-1.5-pro";
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create LLM instance from config
 */
export function createLLM(config: LLMConfig) {
  const provider = config.provider || detectProvider(config.apiKey);
  const model = config.model || getDefaultModel(provider);

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(model);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Generate text completion (unified interface)
 */
export async function generateCompletion(
  config: LLMConfig,
  prompt: string,
  options?: {
    system?: string;
    maxTokens?: number;
    temperature?: number;
  },
) {
  const model = createLLM(config);

  const result = await generateText({
    model,
    prompt,
    system: options?.system,
    maxTokens: options?.maxTokens || 1000,
    temperature: options?.temperature || 0.7,
  });

  return {
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

/**
 * Example usage
 */
if (import.meta.main) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ||
    Deno.env.get("OPENAI_API_KEY") ||
    Deno.env.get("GOOGLE_API_KEY");

  if (!apiKey) {
    console.error("No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY");
    Deno.exit(1);
  }

  console.log("🤖 Testing LLM provider...");

  const provider = detectProvider(apiKey);
  console.log(`   Provider: ${provider}`);
  console.log(`   Model: ${getDefaultModel(provider)}`);

  const result = await generateCompletion(
    { apiKey },
    "Say hello in one sentence",
  );

  console.log(`\n✅ Response: ${result.text}`);
  console.log(`   Tokens: ${result.usage.totalTokens}`);
}
