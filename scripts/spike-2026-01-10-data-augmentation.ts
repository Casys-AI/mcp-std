#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * SPIKE: Data Augmentation for SHGAT Training
 *
 * Two strategies:
 * 1. Intent Reformulation: Generate paraphrases for existing workflow intents
 * 2. Synthetic Workflow Generation: Generate plausible workflows from tool list
 *
 * Uses OpenAI API (set OPENAI_API_KEY env var)
 *
 * Usage:
 *   # Reformulate intents for existing workflows
 *   deno run --allow-net --allow-env scripts/spike-data-augmentation.ts reformulate
 *
 *   # Generate synthetic workflows from tools
 *   deno run --allow-net --allow-env scripts/spike-data-augmentation.ts generate
 *
 * @module scripts/spike-data-augmentation
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MODEL = "gpt-4o-mini"; // Fast & cheap for augmentation

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function callOpenAI(messages: OpenAIMessage[], temperature = 0.7): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: OpenAIResponse = await response.json();
  return data.choices[0]?.message?.content ?? "";
}

// =============================================================================
// Strategy 1: Intent Reformulation
// =============================================================================

/**
 * Generate N paraphrases of an intent
 */
async function reformulateIntent(intent: string, count: number = 4): Promise<string[]> {
  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: `You are a query reformulation expert. Given a user intent/query, generate ${count} different paraphrases that express the same meaning but with different wording.

Rules:
- Keep the same semantic meaning
- Vary the vocabulary and structure
- Include both formal and casual phrasings
- Keep them concise (similar length to original)
- Output as JSON array of strings, nothing else`,
    },
    {
      role: "user",
      content: `Original intent: "${intent}"

Generate ${count} paraphrases as JSON array:`,
    },
  ];

  const response = await callOpenAI(messages, 0.8);

  try {
    // Extract JSON array from response
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch {
    console.error("Failed to parse reformulations:", response);
    return [];
  }
}

// =============================================================================
// Strategy 2: Synthetic Workflow Generation
// =============================================================================

interface Tool {
  id: string;
  name: string;
  description?: string;
}

interface SyntheticWorkflow {
  intent: string;
  tools: string[];
  description: string;
}

/**
 * Generate plausible workflows from a list of tools
 */
async function generateSyntheticWorkflows(
  tools: Tool[],
  count: number = 5
): Promise<SyntheticWorkflow[]> {
  // Sample tools to fit in context (max ~50 tools per call)
  const sampledTools = tools.length > 50
    ? tools.sort(() => Math.random() - 0.5).slice(0, 50)
    : tools;

  const toolList = sampledTools
    .map(t => `- ${t.id}: ${t.description || t.name}`)
    .join("\n");

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: `You are an expert at designing tool workflows. Given a list of available tools, generate ${count} realistic workflows that a developer might execute.

Each workflow should:
- Have a clear, natural language intent (what the user wants to achieve)
- Use 2-5 tools from the list in a logical sequence
- Represent a realistic developer task

Output as JSON array with format:
[
  {
    "intent": "natural language description of what user wants",
    "tools": ["tool_id_1", "tool_id_2", ...],
    "description": "brief explanation of the workflow"
  }
]`,
    },
    {
      role: "user",
      content: `Available tools:
${toolList}

Generate ${count} realistic workflows as JSON array:`,
    },
  ];

  const response = await callOpenAI(messages, 0.9);

  try {
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch {
    console.error("Failed to parse workflows:", response);
    return [];
  }
}

// =============================================================================
// Demo / Test
// =============================================================================

async function demoReformulation() {
  console.log("=== Intent Reformulation Demo ===\n");

  const testIntents = [
    "execute a postgres database query",
    "read and parse a JSON configuration file",
    "commit changes to git with a message",
    "search for files matching a pattern",
  ];

  for (const intent of testIntents) {
    console.log(`Original: "${intent}"`);
    const reformulations = await reformulateIntent(intent, 4);
    console.log("Reformulations:");
    reformulations.forEach((r, i) => console.log(`  ${i + 1}. "${r}"`));
    console.log();
  }
}

async function demoGeneration() {
  console.log("=== Synthetic Workflow Generation Demo ===\n");

  // Sample tools (in real usage, load from DB)
  const sampleTools: Tool[] = [
    { id: "std:psql_query", name: "PostgreSQL Query", description: "Execute SQL query on PostgreSQL database" },
    { id: "std:read_file", name: "Read File", description: "Read contents of a file" },
    { id: "std:write_file", name: "Write File", description: "Write content to a file" },
    { id: "std:git_commit", name: "Git Commit", description: "Create a git commit with message" },
    { id: "std:git_push", name: "Git Push", description: "Push commits to remote repository" },
    { id: "std:git_status", name: "Git Status", description: "Show git working tree status" },
    { id: "std:glob", name: "Glob", description: "Find files matching a glob pattern" },
    { id: "std:grep", name: "Grep", description: "Search file contents with regex" },
    { id: "std:http_get", name: "HTTP GET", description: "Make HTTP GET request" },
    { id: "std:json_parse", name: "JSON Parse", description: "Parse JSON string to object" },
    { id: "std:json_stringify", name: "JSON Stringify", description: "Convert object to JSON string" },
    { id: "std:shell_exec", name: "Shell Execute", description: "Execute shell command" },
    { id: "std:docker_run", name: "Docker Run", description: "Run a Docker container" },
    { id: "std:npm_install", name: "NPM Install", description: "Install npm packages" },
    { id: "std:npm_run", name: "NPM Run", description: "Run npm script" },
  ];

  const workflows = await generateSyntheticWorkflows(sampleTools, 5);

  console.log("Generated Workflows:\n");
  workflows.forEach((w, i) => {
    console.log(`${i + 1}. Intent: "${w.intent}"`);
    console.log(`   Tools: ${w.tools.join(" → ")}`);
    console.log(`   Description: ${w.description}`);
    console.log();
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const command = Deno.args[0] || "both";

  if (!OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable not set");
    console.error("Usage: OPENAI_API_KEY=sk-... deno run ... scripts/spike-data-augmentation.ts");
    Deno.exit(1);
  }

  console.log(`Using model: ${MODEL}\n`);

  switch (command) {
    case "reformulate":
      await demoReformulation();
      break;
    case "generate":
      await demoGeneration();
      break;
    case "both":
    default:
      await demoReformulation();
      console.log("\n" + "=".repeat(50) + "\n");
      await demoGeneration();
      break;
  }
}

main().catch(console.error);
