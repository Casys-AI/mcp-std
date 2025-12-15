#!/usr/bin/env -S deno run -A --watch=static/,routes/,islands/,components/
/**
 * Fresh 2.x Development Server
 *
 * This is a compatibility wrapper that launches Vite with Fresh 2.x.
 * Fresh 2.x uses Vite as the bundler instead of the old Builder API.
 *
 * For direct Vite usage, run: deno task dev:fresh
 */

import { logAuthMode, validateAuthConfig } from "../lib/auth.ts";

// Story 9.3: Log auth mode at startup (AC #5)
logAuthMode("Fresh Dashboard");

// SECURITY: Validate auth config - fails in production without auth
validateAuthConfig("Fresh Dashboard");

// Get port from environment or use default
const port = parseInt(Deno.env.get("PORT_DASHBOARD") || "8081");

console.log(`\n🍋 Fresh 2.x + Vite development server`);
console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
console.log(`🔧 API: http://localhost:3003\n`);

// Launch Vite dev server
const command = new Deno.Command("deno", {
  args: [
    "run",
    "-A",
    "--env",
    "--unstable-kv",
    "--node-modules-dir=auto",
    "npm:vite",
  ],
  cwd: Deno.cwd() + "/src/web",
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const process = command.spawn();
const status = await process.status;

Deno.exit(status.code);
