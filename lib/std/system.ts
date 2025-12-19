/**
 * System tools - execute system commands via Deno subprocess
 *
 * These tools require the actual binaries to be installed on the system.
 * They use Deno.Command for subprocess execution.
 *
 * @module lib/std/system
 */

import type { MiniTool } from "./types.ts";

// Helper to run a command and return output
async function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const command = new Deno.Command(cmd, {
      args,
      cwd: options?.cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const timeoutMs = options?.timeout ?? 30000;
    const process = command.spawn();

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        try {
          process.kill("SIGTERM");
        } catch { /* ignore */ }
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race between command completion and timeout
    const output = await Promise.race([process.output(), timeoutPromise]);

    return {
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      code: output.code,
    };
  } catch (e) {
    if ((e as Error).message?.includes("timed out")) {
      throw e;
    }
    throw new Error(`Failed to execute ${cmd}: ${(e as Error).message}`);
  }
}

export const systemTools: MiniTool[] = [
  // ==================== DOCKER TOOLS ====================
  {
    name: "docker_ps",
    description: "List Docker containers (docker ps)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Show all containers (default: only running)" },
        format: { type: "string", description: "Output format (json, table)" },
      },
    },
    handler: async ({ all = false, format = "json" }) => {
      const args = ["ps"];
      if (all) args.push("-a");
      if (format === "json") args.push("--format", "{{json .}}");

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker ps failed: ${result.stderr}`);
      }

      if (format === "json") {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        const containers = lines.map((line) => JSON.parse(line));
        return { containers, count: containers.length };
      }
      return result.stdout;
    },
  },
  {
    name: "docker_images",
    description: "List Docker images (docker images)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Show all images including intermediates" },
        format: { type: "string", description: "Output format (json, table)" },
      },
    },
    handler: async ({ all = false, format = "json" }) => {
      const args = ["images"];
      if (all) args.push("-a");
      if (format === "json") args.push("--format", "{{json .}}");

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker images failed: ${result.stderr}`);
      }

      if (format === "json") {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        const images = lines.map((line) => JSON.parse(line));
        return { images, count: images.length };
      }
      return result.stdout;
    },
  },
  {
    name: "docker_logs",
    description: "Get logs from a Docker container",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        container: { type: "string", description: "Container ID or name" },
        tail: { type: "number", description: "Number of lines to show from end (default: 100)" },
        since: { type: "string", description: "Show logs since timestamp (e.g., '10m', '1h')" },
      },
      required: ["container"],
    },
    handler: async ({ container, tail = 100, since }) => {
      const args = ["logs", "--tail", String(tail)];
      if (since) args.push("--since", since as string);
      args.push(container as string);

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker logs failed: ${result.stderr}`);
      }
      return { logs: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: "docker_compose_ps",
    description: "List Docker Compose services",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Compose file path (default: docker-compose.yml)" },
        cwd: { type: "string", description: "Working directory" },
      },
    },
    handler: async ({ file, cwd }) => {
      const args = ["compose"];
      if (file) args.push("-f", file as string);
      args.push("ps", "--format", "json");

      const result = await runCommand("docker", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`docker compose ps failed: ${result.stderr}`);
      }

      try {
        const services = JSON.parse(result.stdout);
        return { services, count: services.length };
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "docker_stats",
    description: "Get Docker container resource usage statistics",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        container: { type: "string", description: "Container ID or name (optional, all if omitted)" },
      },
    },
    handler: async ({ container }) => {
      const args = ["stats", "--no-stream", "--format", "{{json .}}"];
      if (container) args.push(container as string);

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker stats failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const stats = lines.map((line) => JSON.parse(line));
      return { stats, count: stats.length };
    },
  },

  // ==================== GIT TOOLS ====================
  {
    name: "git_status",
    description: "Get git repository status",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        short: { type: "boolean", description: "Short format output" },
      },
    },
    handler: async ({ cwd, short = false }) => {
      const args = ["status"];
      if (short) args.push("-s");
      args.push("--porcelain=v2", "--branch");

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git status failed: ${result.stderr}`);
      }

      // Parse porcelain v2 output
      const lines = result.stdout.trim().split("\n");
      const branch = lines.find((l) => l.startsWith("# branch.head"))?.split(" ")[2] || "unknown";
      const upstream = lines.find((l) => l.startsWith("# branch.upstream"))?.split(" ")[2];
      const changes = lines.filter((l) => !l.startsWith("#"));

      return {
        branch,
        upstream,
        clean: changes.length === 0,
        changes: changes.length,
        files: changes.map((line) => {
          const parts = line.split(" ");
          return { status: parts[0], path: parts[parts.length - 1] };
        }),
      };
    },
  },
  {
    name: "git_log",
    description: "Get git commit history",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        count: { type: "number", description: "Number of commits (default: 10)" },
        oneline: { type: "boolean", description: "One line per commit" },
        author: { type: "string", description: "Filter by author" },
        since: { type: "string", description: "Show commits since date (e.g., '1 week ago')" },
      },
    },
    handler: async ({ cwd, count = 10, oneline = true, author, since }) => {
      const args = ["log", `-${count}`];
      if (oneline) {
        args.push("--format=%H|%an|%ae|%at|%s");
      }
      if (author) args.push(`--author=${author}`);
      if (since) args.push(`--since=${since}`);

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git log failed: ${result.stderr}`);
      }

      if (oneline) {
        const commits = result.stdout.trim().split("\n").filter(Boolean).map((line) => {
          const [hash, author, email, timestamp, ...messageParts] = line.split("|");
          return {
            hash,
            author,
            email,
            date: new Date(parseInt(timestamp) * 1000).toISOString(),
            message: messageParts.join("|"),
          };
        });
        return { commits, count: commits.length };
      }
      return result.stdout;
    },
  },
  {
    name: "git_diff",
    description: "Show git diff",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        staged: { type: "boolean", description: "Show staged changes only" },
        file: { type: "string", description: "Specific file to diff" },
        stat: { type: "boolean", description: "Show diffstat only" },
      },
    },
    handler: async ({ cwd, staged = false, file, stat = false }) => {
      const args = ["diff"];
      if (staged) args.push("--staged");
      if (stat) args.push("--stat");
      if (file) args.push(file as string);

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git diff failed: ${result.stderr}`);
      }
      return { diff: result.stdout, hasChanges: result.stdout.length > 0 };
    },
  },
  {
    name: "git_branch",
    description: "List or manage git branches",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        all: { type: "boolean", description: "Show all branches including remote" },
        current: { type: "boolean", description: "Show current branch only" },
      },
    },
    handler: async ({ cwd, all = false, current = false }) => {
      if (current) {
        const result = await runCommand("git", ["branch", "--show-current"], { cwd: cwd as string });
        return { current: result.stdout.trim() };
      }

      const args = ["branch", "--format=%(refname:short)|%(upstream:short)|%(HEAD)"];
      if (all) args.push("-a");

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git branch failed: ${result.stderr}`);
      }

      const branches = result.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [name, upstream, head] = line.split("|");
        return { name, upstream: upstream || null, current: head === "*" };
      });

      return {
        branches,
        current: branches.find((b) => b.current)?.name,
        count: branches.length,
      };
    },
  },

  // ==================== NETWORK TOOLS ====================
  {
    name: "curl_fetch",
    description: "Make HTTP request using curl",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"], description: "HTTP method" },
        headers: { type: "object", description: "Request headers" },
        data: { type: "string", description: "Request body" },
        timeout: { type: "number", description: "Timeout in seconds (default: 30)" },
        followRedirects: { type: "boolean", description: "Follow redirects (default: true)" },
        insecure: { type: "boolean", description: "Allow insecure SSL connections" },
      },
      required: ["url"],
    },
    handler: async ({ url, method = "GET", headers, data, timeout = 30, followRedirects = true, insecure = false }) => {
      const args = ["-s", "-w", "\n%{http_code}\n%{time_total}"];

      if (method !== "GET") args.push("-X", method as string);
      if (followRedirects) args.push("-L");
      if (insecure) args.push("-k");
      args.push("--max-time", String(timeout));

      if (headers) {
        for (const [key, value] of Object.entries(headers as Record<string, string>)) {
          args.push("-H", `${key}: ${value}`);
        }
      }

      if (data) {
        args.push("-d", data as string);
      }

      args.push(url as string);

      const result = await runCommand("curl", args, { timeout: (timeout as number) * 1000 + 5000 });

      const lines = result.stdout.trim().split("\n");
      const timeTotal = parseFloat(lines.pop() || "0");
      const statusCode = parseInt(lines.pop() || "0", 10);
      const body = lines.join("\n");

      return {
        statusCode,
        body,
        timeMs: Math.round(timeTotal * 1000),
        success: statusCode >= 200 && statusCode < 300,
      };
    },
  },
  {
    name: "dig_lookup",
    description: "DNS lookup using dig",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain to lookup" },
        type: { type: "string", enum: ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "ANY"], description: "Record type (default: A)" },
        server: { type: "string", description: "DNS server to use (e.g., 8.8.8.8)" },
        short: { type: "boolean", description: "Short output (answers only)" },
      },
      required: ["domain"],
    },
    handler: async ({ domain, type = "A", server, short = true }) => {
      const args = [];
      if (server) args.push(`@${server}`);
      args.push(domain as string, type as string);
      if (short) args.push("+short");

      const result = await runCommand("dig", args);
      if (result.code !== 0) {
        throw new Error(`dig failed: ${result.stderr}`);
      }

      if (short) {
        const records = result.stdout.trim().split("\n").filter(Boolean);
        return { domain, type, records, count: records.length };
      }
      return { output: result.stdout };
    },
  },
  {
    name: "ping_host",
    description: "Ping a host to check connectivity",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Host to ping" },
        count: { type: "number", description: "Number of pings (default: 4)" },
        timeout: { type: "number", description: "Timeout per ping in seconds (default: 5)" },
      },
      required: ["host"],
    },
    handler: async ({ host, count = 4, timeout = 5 }) => {
      const args = ["-c", String(count), "-W", String(timeout), host as string];

      const result = await runCommand("ping", args, { timeout: (count as number) * (timeout as number) * 1000 + 5000 });

      // Parse ping output
      const lines = result.stdout.split("\n");
      const statsLine = lines.find((l) => l.includes("packets transmitted"));
      const rttLine = lines.find((l) => l.includes("rtt") || l.includes("round-trip"));

      let transmitted = 0, received = 0, loss = 0;
      if (statsLine) {
        const match = statsLine.match(/(\d+) packets transmitted, (\d+) (?:packets )?received, (\d+(?:\.\d+)?)% packet loss/);
        if (match) {
          transmitted = parseInt(match[1], 10);
          received = parseInt(match[2], 10);
          loss = parseFloat(match[3]);
        }
      }

      let min = 0, avg = 0, max = 0;
      if (rttLine) {
        const match = rttLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        if (match) {
          min = parseFloat(match[1]);
          avg = parseFloat(match[2]);
          max = parseFloat(match[3]);
        }
      }

      return {
        host,
        alive: received > 0,
        transmitted,
        received,
        lossPercent: loss,
        rtt: { min, avg, max },
      };
    },
  },
  {
    name: "nslookup",
    description: "DNS lookup using nslookup (simpler than dig)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain to lookup" },
        server: { type: "string", description: "DNS server to use" },
      },
      required: ["domain"],
    },
    handler: async ({ domain, server }) => {
      const args = [domain as string];
      if (server) args.push(server as string);

      const result = await runCommand("nslookup", args);

      // Parse nslookup output
      const lines = result.stdout.split("\n");
      const addresses: string[] = [];

      for (const line of lines) {
        const match = line.match(/Address:\s*([^\s]+)/);
        if (match && !line.includes("#")) {
          addresses.push(match[1]);
        }
      }

      return {
        domain,
        addresses,
        resolved: addresses.length > 0,
      };
    },
  },

  // ==================== PROCESS TOOLS ====================
  {
    name: "ps_list",
    description: "List running processes",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter by process name" },
        user: { type: "string", description: "Filter by user" },
        sort: { type: "string", enum: ["cpu", "mem", "pid", "time"], description: "Sort by field" },
        limit: { type: "number", description: "Limit number of results" },
      },
    },
    handler: async ({ filter, user, sort = "cpu", limit = 20 }) => {
      const sortField = { cpu: "-%cpu", mem: "-%mem", pid: "pid", time: "-time" }[sort as string] || "-%cpu";
      const args = ["aux", "--sort", sortField];

      const result = await runCommand("ps", args);
      if (result.code !== 0) {
        throw new Error(`ps failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      // Skip header line
      let processes = lines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          user: parts[0],
          pid: parseInt(parts[1], 10),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parseInt(parts[4], 10),
          rss: parseInt(parts[5], 10),
          tty: parts[6],
          stat: parts[7],
          start: parts[8],
          time: parts[9],
          command: parts.slice(10).join(" "),
        };
      });

      if (filter) {
        const f = (filter as string).toLowerCase();
        processes = processes.filter((p) => p.command.toLowerCase().includes(f));
      }
      if (user) {
        processes = processes.filter((p) => p.user === user);
      }

      processes = processes.slice(0, limit as number);

      return { processes, count: processes.length };
    },
  },
  {
    name: "which_command",
    description: "Find the path of a command",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to find" },
      },
      required: ["command"],
    },
    handler: async ({ command }) => {
      const result = await runCommand("which", [command as string]);
      return {
        command,
        found: result.code === 0,
        path: result.stdout.trim() || null,
      };
    },
  },
  {
    name: "env_get",
    description: "Get environment variables",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Variable name (optional, returns all if omitted)" },
        filter: { type: "string", description: "Filter variables by prefix" },
      },
    },
    handler: ({ name, filter }) => {
      if (name) {
        const value = Deno.env.get(name as string);
        return { name, value, exists: value !== undefined };
      }

      const env = Object.fromEntries(Object.entries(Deno.env.toObject()));

      if (filter) {
        const prefix = (filter as string).toUpperCase();
        const filtered = Object.fromEntries(
          Object.entries(env).filter(([key]) => key.toUpperCase().startsWith(prefix))
        );
        return { variables: filtered, count: Object.keys(filtered).length };
      }

      return { variables: env, count: Object.keys(env).length };
    },
  },
  {
    name: "disk_usage",
    description: "Get disk usage information",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to check (default: /)" },
        human: { type: "boolean", description: "Human-readable output (default: true)" },
      },
    },
    handler: async ({ path = "/", human = true }) => {
      const args = human ? ["-h", path as string] : [path as string];
      const result = await runCommand("df", args);

      if (result.code !== 0) {
        throw new Error(`df failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const dataLine = lines[1];
      const parts = dataLine.split(/\s+/);

      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountedOn: parts[5],
      };
    },
  },

  // ==================== ARCHIVE TOOLS ====================
  {
    name: "tar_create",
    description: "Create a tar archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Output archive path" },
        files: { type: "array", items: { type: "string" }, description: "Files/directories to archive" },
        compress: { type: "string", enum: ["none", "gzip", "bzip2", "xz"], description: "Compression type" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["output", "files"],
    },
    handler: async ({ output, files, compress = "gzip", cwd }) => {
      const args = ["-c"];
      switch (compress) {
        case "gzip": args.push("-z"); break;
        case "bzip2": args.push("-j"); break;
        case "xz": args.push("-J"); break;
      }
      args.push("-f", output as string, ...(files as string[]));

      const result = await runCommand("tar", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`tar create failed: ${result.stderr}`);
      }
      return { success: true, archive: output, files: files };
    },
  },
  {
    name: "tar_extract",
    description: "Extract a tar archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Archive path" },
        destination: { type: "string", description: "Extraction destination" },
        list: { type: "boolean", description: "List contents only, don't extract" },
      },
      required: ["archive"],
    },
    handler: async ({ archive, destination, list = false }) => {
      const args = list ? ["-tvf", archive as string] : ["-xf", archive as string];
      if (destination && !list) {
        args.push("-C", destination as string);
      }

      const result = await runCommand("tar", args);
      if (result.code !== 0) {
        throw new Error(`tar extract failed: ${result.stderr}`);
      }

      if (list) {
        return { files: result.stdout.trim().split("\n") };
      }
      return { success: true, destination: destination || "." };
    },
  },
  {
    name: "zip_create",
    description: "Create a zip archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Output zip path" },
        files: { type: "array", items: { type: "string" }, description: "Files to zip" },
        recursive: { type: "boolean", description: "Recurse into directories (default: true)" },
      },
      required: ["output", "files"],
    },
    handler: async ({ output, files, recursive = true }) => {
      const args = recursive ? ["-r", output as string] : [output as string];
      args.push(...(files as string[]));

      const result = await runCommand("zip", args);
      if (result.code !== 0) {
        throw new Error(`zip failed: ${result.stderr}`);
      }
      return { success: true, archive: output };
    },
  },
  {
    name: "unzip",
    description: "Extract a zip archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Zip archive path" },
        destination: { type: "string", description: "Extraction destination" },
        list: { type: "boolean", description: "List contents only" },
      },
      required: ["archive"],
    },
    handler: async ({ archive, destination, list = false }) => {
      const args = list ? ["-l", archive as string] : [archive as string];
      if (destination && !list) {
        args.push("-d", destination as string);
      }

      const result = await runCommand("unzip", args);
      if (result.code !== 0) {
        throw new Error(`unzip failed: ${result.stderr}`);
      }

      return list ? { contents: result.stdout } : { success: true, destination: destination || "." };
    },
  },

  // ==================== SSH/SCP TOOLS ====================
  {
    name: "ssh_exec",
    description: "Execute command on remote host via SSH",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Remote host (user@host)" },
        command: { type: "string", description: "Command to execute" },
        port: { type: "number", description: "SSH port (default: 22)" },
        identity: { type: "string", description: "Identity file path" },
        timeout: { type: "number", description: "Connection timeout in seconds" },
      },
      required: ["host", "command"],
    },
    handler: async ({ host, command, port, identity, timeout = 30 }) => {
      const args = ["-o", "StrictHostKeyChecking=no", "-o", `ConnectTimeout=${timeout}`];
      if (port) args.push("-p", String(port));
      if (identity) args.push("-i", identity as string);
      args.push(host as string, command as string);

      const result = await runCommand("ssh", args, { timeout: (timeout as number) * 1000 + 5000 });
      return {
        host,
        command,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },
  {
    name: "scp_copy",
    description: "Copy files via SCP",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path (local or user@host:path)" },
        destination: { type: "string", description: "Destination path" },
        recursive: { type: "boolean", description: "Copy directories recursively" },
        port: { type: "number", description: "SSH port" },
        identity: { type: "string", description: "Identity file path" },
      },
      required: ["source", "destination"],
    },
    handler: async ({ source, destination, recursive = false, port, identity }) => {
      const args = ["-o", "StrictHostKeyChecking=no"];
      if (recursive) args.push("-r");
      if (port) args.push("-P", String(port));
      if (identity) args.push("-i", identity as string);
      args.push(source as string, destination as string);

      const result = await runCommand("scp", args, { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`scp failed: ${result.stderr}`);
      }
      return { success: true, source, destination };
    },
  },
  {
    name: "rsync",
    description: "Sync files with rsync",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
        delete: { type: "boolean", description: "Delete extraneous files from destination" },
        dryRun: { type: "boolean", description: "Dry run (show what would be done)" },
        exclude: { type: "array", items: { type: "string" }, description: "Patterns to exclude" },
      },
      required: ["source", "destination"],
    },
    handler: async ({ source, destination, delete: del = false, dryRun = false, exclude = [] }) => {
      const args = ["-avz", "--progress"];
      if (del) args.push("--delete");
      if (dryRun) args.push("--dry-run");
      for (const pattern of exclude as string[]) {
        args.push("--exclude", pattern);
      }
      args.push(source as string, destination as string);

      const result = await runCommand("rsync", args, { timeout: 600000 });
      if (result.code !== 0) {
        throw new Error(`rsync failed: ${result.stderr}`);
      }
      return { success: true, output: result.stdout, dryRun };
    },
  },

  // ==================== PACKAGE MANAGER TOOLS ====================
  {
    name: "npm_run",
    description: "Run npm commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["install", "run", "test", "build", "list", "outdated", "update", "audit"], description: "npm command" },
        args: { type: "array", items: { type: "string" }, description: "Additional arguments" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["command"],
    },
    handler: async ({ command, args = [], cwd }) => {
      const cmdArgs = [command as string, ...(args as string[])];
      const result = await runCommand("npm", cmdArgs, { cwd: cwd as string, timeout: 300000 });
      return {
        command: `npm ${cmdArgs.join(" ")}`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },
  {
    name: "pip_run",
    description: "Run pip commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["install", "uninstall", "list", "freeze", "show", "search", "check"], description: "pip command" },
        packages: { type: "array", items: { type: "string" }, description: "Package names" },
        upgrade: { type: "boolean", description: "Upgrade packages" },
      },
      required: ["command"],
    },
    handler: async ({ command, packages = [], upgrade = false }) => {
      const args = [command as string];
      if (upgrade && command === "install") args.push("--upgrade");
      args.push(...(packages as string[]));

      const result = await runCommand("pip", args, { timeout: 300000 });
      return {
        command: `pip ${args.join(" ")}`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },

  // ==================== KUBERNETES TOOLS ====================
  {
    name: "kubectl_get",
    description: "Get Kubernetes resources",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string", description: "Resource type (pods, services, deployments, etc.)" },
        name: { type: "string", description: "Resource name (optional)" },
        namespace: { type: "string", description: "Namespace" },
        output: { type: "string", enum: ["json", "yaml", "wide", "name"], description: "Output format" },
        selector: { type: "string", description: "Label selector" },
        allNamespaces: { type: "boolean", description: "All namespaces" },
      },
      required: ["resource"],
    },
    handler: async ({ resource, name, namespace, output = "json", selector, allNamespaces = false }) => {
      const args = ["get", resource as string];
      if (name) args.push(name as string);
      if (namespace) args.push("-n", namespace as string);
      if (allNamespaces) args.push("-A");
      if (selector) args.push("-l", selector as string);
      args.push("-o", output as string);

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl get failed: ${result.stderr}`);
      }

      if (output === "json") {
        try {
          return JSON.parse(result.stdout);
        } catch {
          return { output: result.stdout };
        }
      }
      return { output: result.stdout };
    },
  },
  {
    name: "kubectl_apply",
    description: "Apply Kubernetes manifest",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Manifest file path" },
        namespace: { type: "string", description: "Namespace" },
        dryRun: { type: "boolean", description: "Dry run (client or server)" },
      },
      required: ["file"],
    },
    handler: async ({ file, namespace, dryRun = false }) => {
      const args = ["apply", "-f", file as string];
      if (namespace) args.push("-n", namespace as string);
      if (dryRun) args.push("--dry-run=client");

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl apply failed: ${result.stderr}`);
      }
      return { success: true, output: result.stdout };
    },
  },
  {
    name: "kubectl_logs",
    description: "Get pod logs",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pod: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name" },
        tail: { type: "number", description: "Lines to show from end" },
        since: { type: "string", description: "Show logs since (e.g., '1h', '10m')" },
        follow: { type: "boolean", description: "Follow logs (stream)" },
      },
      required: ["pod"],
    },
    handler: async ({ pod, namespace, container, tail, since, follow }) => {
      const args = ["logs", pod as string];
      if (namespace) args.push("-n", namespace as string);
      if (container) args.push("-c", container as string);
      if (tail) args.push("--tail", String(tail));
      if (since) args.push("--since", since as string);
      if (follow) args.push("-f"); // Note: will timeout after 60s for streaming

      const result = await runCommand("kubectl", args, { timeout: 60000 });
      return { logs: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: "kubectl_exec",
    description: "Execute command in pod",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pod: { type: "string", description: "Pod name" },
        command: { type: "string", description: "Command to execute" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name" },
      },
      required: ["pod", "command"],
    },
    handler: async ({ pod, command, namespace, container }) => {
      const args = ["exec", pod as string];
      if (namespace) args.push("-n", namespace as string);
      if (container) args.push("-c", container as string);
      args.push("--", "sh", "-c", command as string);

      const result = await runCommand("kubectl", args, { timeout: 60000 });
      return {
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  },

  // ==================== DATABASE TOOLS ====================
  {
    name: "sqlite_query",
    description: "Execute SQLite query",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
        query: { type: "string", description: "SQL query" },
        mode: { type: "string", enum: ["json", "csv", "table", "line"], description: "Output mode" },
      },
      required: ["database", "query"],
    },
    handler: async ({ database, query, mode = "json" }) => {
      const args = [database as string, "-cmd", `.mode ${mode}`, query as string];

      const result = await runCommand("sqlite3", args);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }

      if (mode === "json") {
        try {
          return { results: JSON.parse(result.stdout || "[]") };
        } catch {
          return { output: result.stdout };
        }
      }
      return { output: result.stdout };
    },
  },
  {
    name: "psql_query",
    description: "Execute PostgreSQL query",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        query: { type: "string", description: "SQL query" },
      },
      required: ["database", "query"],
    },
    handler: async ({ host = "localhost", port = 5432, database, user, query }) => {
      const args = ["-h", host as string, "-p", String(port), "-d", database as string];
      if (user) args.push("-U", user as string);
      args.push("-t", "-A", "-c", query as string);

      const result = await runCommand("psql", args);
      if (result.code !== 0) {
        throw new Error(`psql failed: ${result.stderr}`);
      }
      return { output: result.stdout.trim() };
    },
  },
  {
    name: "redis_cli",
    description: "Execute Redis command",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        command: { type: "string", description: "Redis command" },
        database: { type: "number", description: "Database number" },
      },
      required: ["command"],
    },
    handler: async ({ host = "localhost", port = 6379, command, database }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push(...(command as string).split(" "));

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      return { result: result.stdout.trim() };
    },
  },

  // ==================== MEDIA TOOLS ====================
  {
    name: "ffmpeg_convert",
    description: "Convert media files with ffmpeg",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input file path" },
        output: { type: "string", description: "Output file path" },
        videoCodec: { type: "string", description: "Video codec (e.g., libx264, copy)" },
        audioCodec: { type: "string", description: "Audio codec (e.g., aac, copy)" },
        videoBitrate: { type: "string", description: "Video bitrate (e.g., 1M, 5000k)" },
        audioBitrate: { type: "string", description: "Audio bitrate (e.g., 128k)" },
        resolution: { type: "string", description: "Output resolution (e.g., 1920x1080)" },
        startTime: { type: "string", description: "Start time (e.g., 00:01:30)" },
        duration: { type: "string", description: "Duration (e.g., 00:00:30)" },
      },
      required: ["input", "output"],
    },
    handler: async ({ input, output, videoCodec, audioCodec, videoBitrate, audioBitrate, resolution, startTime, duration }) => {
      const args = ["-i", input as string, "-y"];
      if (startTime) args.push("-ss", startTime as string);
      if (duration) args.push("-t", duration as string);
      if (videoCodec) args.push("-c:v", videoCodec as string);
      if (audioCodec) args.push("-c:a", audioCodec as string);
      if (videoBitrate) args.push("-b:v", videoBitrate as string);
      if (audioBitrate) args.push("-b:a", audioBitrate as string);
      if (resolution) args.push("-s", resolution as string);
      args.push(output as string);

      const result = await runCommand("ffmpeg", args, { timeout: 600000 });
      if (result.code !== 0) {
        throw new Error(`ffmpeg failed: ${result.stderr}`);
      }
      return { success: true, output };
    },
  },
  {
    name: "ffprobe_info",
    description: "Get media file information",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Media file path" },
      },
      required: ["file"],
    },
    handler: async ({ file }) => {
      const args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file as string];

      const result = await runCommand("ffprobe", args);
      if (result.code !== 0) {
        throw new Error(`ffprobe failed: ${result.stderr}`);
      }

      try {
        return JSON.parse(result.stdout);
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "imagemagick_convert",
    description: "Convert/transform images with ImageMagick",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input image path" },
        output: { type: "string", description: "Output image path" },
        resize: { type: "string", description: "Resize (e.g., 800x600, 50%)" },
        quality: { type: "number", description: "Quality 1-100" },
        format: { type: "string", description: "Output format (jpg, png, webp, etc.)" },
        rotate: { type: "number", description: "Rotation angle in degrees" },
        crop: { type: "string", description: "Crop geometry (e.g., 100x100+10+10)" },
      },
      required: ["input", "output"],
    },
    handler: async ({ input, output, resize, quality, rotate, crop }) => {
      const args = [input as string];
      if (resize) args.push("-resize", resize as string);
      if (quality) args.push("-quality", String(quality));
      if (rotate) args.push("-rotate", String(rotate));
      if (crop) args.push("-crop", crop as string);
      args.push(output as string);

      const result = await runCommand("convert", args);
      if (result.code !== 0) {
        throw new Error(`convert failed: ${result.stderr}`);
      }
      return { success: true, output };
    },
  },

  // ==================== DOWNLOAD TOOLS ====================
  {
    name: "wget_download",
    description: "Download files with wget",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to download" },
        output: { type: "string", description: "Output file path" },
        recursive: { type: "boolean", description: "Recursive download" },
        depth: { type: "number", description: "Recursion depth" },
        continueDownload: { type: "boolean", description: "Continue partial download" },
      },
      required: ["url"],
    },
    handler: async ({ url, output, recursive = false, depth, continueDownload = false }) => {
      const args = ["-q"];
      if (output) args.push("-O", output as string);
      if (recursive) args.push("-r");
      if (depth) args.push("-l", String(depth));
      if (continueDownload) args.push("-c");
      args.push(url as string);

      const result = await runCommand("wget", args, { timeout: 600000 });
      if (result.code !== 0) {
        throw new Error(`wget failed: ${result.stderr}`);
      }
      return { success: true, url, output: output || "downloaded" };
    },
  },

  // ==================== NETWORK TOOLS ====================
  {
    name: "traceroute",
    description: "Trace route to host",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Target host" },
        maxHops: { type: "number", description: "Maximum hops (default: 30)" },
      },
      required: ["host"],
    },
    handler: async ({ host, maxHops = 30 }) => {
      const args = ["-m", String(maxHops), host as string];

      const result = await runCommand("traceroute", args, { timeout: 60000 });
      return { output: result.stdout, success: result.code === 0 };
    },
  },
  {
    name: "netcat",
    description: "Network utility (nc) for port scanning and connections",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Target host" },
        port: { type: "number", description: "Target port" },
        scan: { type: "boolean", description: "Port scan mode" },
        portRange: { type: "string", description: "Port range for scan (e.g., '20-80')" },
        timeout: { type: "number", description: "Timeout in seconds" },
      },
      required: ["host"],
    },
    handler: async ({ host, port, scan = false, portRange, timeout = 5 }) => {
      const args = ["-z", "-v", "-w", String(timeout)];
      args.push(host as string);

      if (scan && portRange) {
        args.push(portRange as string);
      } else if (port) {
        args.push(String(port));
      }

      const result = await runCommand("nc", args, { timeout: (timeout as number) * 1000 + 5000 });
      return {
        host,
        port: port || portRange,
        open: result.code === 0,
        output: result.stderr, // nc outputs to stderr
      };
    },
  },

  // ==================== SERVICE MANAGEMENT ====================
  {
    name: "systemctl",
    description: "Manage systemd services",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["status", "start", "stop", "restart", "enable", "disable", "list-units"], description: "Action" },
        service: { type: "string", description: "Service name (not required for list-units)" },
        type: { type: "string", description: "Unit type filter for list-units" },
      },
      required: ["action"],
    },
    handler: async ({ action, service, type }) => {
      const args = [action as string];
      if (service) args.push(service as string);
      if (action === "list-units" && type) args.push("--type", type as string);

      const result = await runCommand("systemctl", args);
      return {
        action,
        service,
        exitCode: result.code,
        output: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },

  // ==================== CLOUD CLI TOOLS ====================
  {
    name: "aws_cli",
    description: "Run AWS CLI commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", description: "AWS service (s3, ec2, lambda, etc.)" },
        command: { type: "string", description: "Command to run" },
        args: { type: "array", items: { type: "string" }, description: "Additional arguments" },
        region: { type: "string", description: "AWS region" },
        profile: { type: "string", description: "AWS profile" },
      },
      required: ["service", "command"],
    },
    handler: async ({ service, command, args = [], region, profile }) => {
      const cmdArgs = [service as string, command as string, ...(args as string[])];
      if (region) cmdArgs.push("--region", region as string);
      if (profile) cmdArgs.push("--profile", profile as string);
      cmdArgs.push("--output", "json");

      const result = await runCommand("aws", cmdArgs);
      if (result.code !== 0) {
        throw new Error(`aws cli failed: ${result.stderr}`);
      }

      try {
        return JSON.parse(result.stdout);
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "gcloud_cli",
    description: "Run Google Cloud CLI commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", description: "Command group (compute, storage, etc.)" },
        command: { type: "string", description: "Command to run" },
        args: { type: "array", items: { type: "string" }, description: "Additional arguments" },
        project: { type: "string", description: "GCP project" },
      },
      required: ["group", "command"],
    },
    handler: async ({ group, command, args = [], project }) => {
      const cmdArgs = [group as string, command as string, ...(args as string[]), "--format=json"];
      if (project) cmdArgs.push("--project", project as string);

      const result = await runCommand("gcloud", cmdArgs);
      if (result.code !== 0) {
        throw new Error(`gcloud failed: ${result.stderr}`);
      }

      try {
        return JSON.parse(result.stdout);
      } catch {
        return { output: result.stdout };
      }
    },
  },

  // ==================== Environment & System Info ====================
  {
    name: "env_get",
    description: "Get environment variable value",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Variable name" },
      },
      required: ["name"],
    },
    handler: ({ name }) => {
      const value = Deno.env.get(name as string);
      return { name, value, exists: value !== undefined };
    },
  },
  {
    name: "env_list",
    description: "List all environment variables",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter by name prefix" },
      },
    },
    handler: ({ filter }) => {
      const env = Deno.env.toObject();
      if (filter) {
        const prefix = filter as string;
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(env)) {
          if (k.startsWith(prefix)) filtered[k] = v;
        }
        return { count: Object.keys(filtered).length, variables: filtered };
      }
      return { count: Object.keys(env).length, variables: env };
    },
  },
  {
    name: "chmod",
    description: "Change file permissions",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path" },
        mode: { type: "string", description: "Permission mode (e.g., 755, +x, u+rw)" },
        recursive: { type: "boolean", description: "Apply recursively" },
      },
      required: ["path", "mode"],
    },
    handler: async ({ path, mode, recursive }) => {
      const args = [];
      if (recursive) args.push("-R");
      args.push(mode as string, path as string);

      const result = await runCommand("chmod", args);
      if (result.code !== 0) {
        throw new Error(`chmod failed: ${result.stderr}`);
      }
      return { success: true, path, mode };
    },
  },
  {
    name: "chown",
    description: "Change file ownership",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path" },
        owner: { type: "string", description: "Owner (user:group or just user)" },
        recursive: { type: "boolean", description: "Apply recursively" },
      },
      required: ["path", "owner"],
    },
    handler: async ({ path, owner, recursive }) => {
      const args = [];
      if (recursive) args.push("-R");
      args.push(owner as string, path as string);

      const result = await runCommand("chown", args);
      if (result.code !== 0) {
        throw new Error(`chown failed: ${result.stderr}`);
      }
      return { success: true, path, owner };
    },
  },
  {
    name: "df",
    description: "Show disk space usage",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to check (optional)" },
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
      },
    },
    handler: async ({ path, human = true }) => {
      const args = [];
      if (human) args.push("-h");
      args.push("-P"); // POSIX format for parsing
      if (path) args.push(path as string);

      const result = await runCommand("df", args);
      if (result.code !== 0) {
        throw new Error(`df failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      // Skip header line (Filesystem Size Used Avail Use% Mounted)
      const filesystems = lines.slice(1).map(line => {
        const parts = line.split(/\s+/);
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4],
          mountPoint: parts[5],
        };
      });

      return { filesystems };
    },
  },
  {
    name: "du",
    description: "Show directory/file size",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to check" },
        depth: { type: "number", description: "Max depth to report" },
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
        summarize: { type: "boolean", description: "Show only total" },
      },
      required: ["path"],
    },
    handler: async ({ path, depth, human = true, summarize }) => {
      const args = [];
      if (human) args.push("-h");
      if (summarize) args.push("-s");
      else if (depth !== undefined) args.push("-d", String(depth));
      args.push(path as string);

      const result = await runCommand("du", args);
      if (result.code !== 0) {
        throw new Error(`du failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const items = lines.map(line => {
        const [size, ...pathParts] = line.split("\t");
        return { size: size.trim(), path: pathParts.join("\t").trim() };
      });

      return { items };
    },
  },
  {
    name: "free",
    description: "Show memory usage",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
      },
    },
    handler: async ({ human = true }) => {
      const args = [];
      if (human) args.push("-h");

      const result = await runCommand("free", args);
      if (result.code !== 0) {
        throw new Error(`free failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const memLine = lines.find(l => l.startsWith("Mem:"));
      const swapLine = lines.find(l => l.startsWith("Swap:"));

      const parseLine = (line: string | undefined) => {
        if (!line) return null;
        const parts = line.split(/\s+/);
        return {
          total: parts[1],
          used: parts[2],
          free: parts[3],
          shared: parts[4],
          buffCache: parts[5],
          available: parts[6],
        };
      };

      return {
        memory: parseLine(memLine),
        swap: parseLine(swapLine),
      };
    },
  },
  {
    name: "whoami",
    description: "Get current username",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("whoami", []);
      return { username: result.stdout.trim() };
    },
  },
  {
    name: "id",
    description: "Get user and group IDs",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User to check (default: current)" },
      },
    },
    handler: async ({ user }) => {
      const args = user ? [user as string] : [];
      const result = await runCommand("id", args);
      if (result.code !== 0) {
        throw new Error(`id failed: ${result.stderr}`);
      }

      // Parse: uid=1000(user) gid=1000(group) groups=1000(group),27(sudo)
      const output = result.stdout.trim();
      const uidMatch = output.match(/uid=(\d+)\(([^)]+)\)/);
      const gidMatch = output.match(/gid=(\d+)\(([^)]+)\)/);
      const groupsMatch = output.match(/groups=(.+)/);

      return {
        uid: uidMatch ? parseInt(uidMatch[1]) : null,
        user: uidMatch ? uidMatch[2] : null,
        gid: gidMatch ? parseInt(gidMatch[1]) : null,
        group: gidMatch ? gidMatch[2] : null,
        groups: groupsMatch ? groupsMatch[1] : null,
      };
    },
  },
  {
    name: "hostname",
    description: "Get system hostname",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        fqdn: { type: "boolean", description: "Get fully qualified domain name" },
      },
    },
    handler: async ({ fqdn }) => {
      const args = fqdn ? ["-f"] : [];
      const result = await runCommand("hostname", args);
      return { hostname: result.stdout.trim() };
    },
  },
  {
    name: "uptime",
    description: "Get system uptime",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("uptime", ["-p"]);
      const uptime = result.stdout.trim();

      // Also get load averages
      const loadResult = await runCommand("uptime", []);
      const loadMatch = loadResult.stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);

      return {
        uptime,
        loadAverage: loadMatch ? {
          "1min": parseFloat(loadMatch[1]),
          "5min": parseFloat(loadMatch[2]),
          "15min": parseFloat(loadMatch[3]),
        } : null,
      };
    },
  },
  {
    name: "uname",
    description: "Get system information",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("uname", ["-a"]);
      const parts = result.stdout.trim().split(" ");

      return {
        full: result.stdout.trim(),
        kernel: parts[0],
        hostname: parts[1],
        kernelRelease: parts[2],
        kernelVersion: parts[3],
        machine: parts.find(p => p.match(/x86_64|arm64|aarch64/)) || parts[parts.length - 1],
      };
    },
  },
  {
    name: "kill_process",
    description: "Kill a process by PID or name",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID" },
        name: { type: "string", description: "Process name (uses pkill)" },
        signal: { type: "string", description: "Signal (default: TERM)" },
        force: { type: "boolean", description: "Use SIGKILL" },
      },
    },
    handler: async ({ pid, name, signal, force }) => {
      const sig = force ? "KILL" : (signal || "TERM");

      if (pid) {
        const result = await runCommand("kill", [`-${sig}`, String(pid)]);
        if (result.code !== 0) {
          throw new Error(`kill failed: ${result.stderr}`);
        }
        return { success: true, pid, signal: sig };
      } else if (name) {
        const result = await runCommand("pkill", [`-${sig}`, name as string]);
        return { success: result.code === 0, name, signal: sig };
      } else {
        throw new Error("Either pid or name required");
      }
    },
  },
  {
    name: "lsof",
    description: "List open files or network connections",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "List processes using this port" },
        path: { type: "string", description: "List processes using this file" },
        pid: { type: "number", description: "List files open by this PID" },
      },
    },
    handler: async ({ port, path, pid }) => {
      const args: string[] = [];
      if (port) args.push("-i", `:${port}`);
      else if (path) args.push(path as string);
      else if (pid) args.push("-p", String(pid));
      else args.push("-i"); // Default: list network connections

      const result = await runCommand("lsof", args);

      const lines = result.stdout.trim().split("\n");
      if (lines.length < 2) return { processes: [] };

      const processes = lines.slice(1).map(line => {
        const parts = line.split(/\s+/);
        return {
          command: parts[0],
          pid: parseInt(parts[1]),
          user: parts[2],
          fd: parts[3],
          type: parts[4],
          name: parts.slice(8).join(" "),
        };
      });

      return { processes };
    },
  },
  {
    name: "which",
    description: "Find command location",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to find" },
        all: { type: "boolean", description: "Show all matches" },
      },
      required: ["command"],
    },
    handler: async ({ command, all }) => {
      const args = all ? ["-a", command as string] : [command as string];
      const result = await runCommand("which", args);

      if (result.code !== 0) {
        return { found: false, command };
      }

      const paths = result.stdout.trim().split("\n").filter(p => p);
      return {
        found: true,
        command,
        path: paths[0],
        allPaths: all ? paths : undefined,
      };
    },
  },
  {
    name: "ip_address",
    description: "Get network interface information",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        interface: { type: "string", description: "Specific interface" },
      },
    },
    handler: async ({ interface: iface }) => {
      // Try 'ip' first, fall back to 'ifconfig'
      let result = await runCommand("ip", ["-j", "addr", "show"]);

      if (result.code === 0) {
        try {
          const data = JSON.parse(result.stdout);
          const interfaces = data.map((i: { ifname: string; flags: string[]; addr_info: Array<{ family: string; local: string; prefixlen: number }> }) => ({
            name: i.ifname,
            flags: i.flags,
            addresses: i.addr_info?.map((a: { family: string; local: string; prefixlen: number }) => ({
              family: a.family,
              address: a.local,
              prefixlen: a.prefixlen,
            })) || [],
          }));

          if (iface) {
            const found = interfaces.find((i: { name: string }) => i.name === iface);
            return found || { error: `Interface ${iface} not found` };
          }
          return { interfaces };
        } catch {
          return { output: result.stdout };
        }
      }

      // Fallback to ifconfig
      const ifArgs = iface ? [iface as string] : [];
      result = await runCommand("ifconfig", ifArgs);
      return { output: result.stdout };
    },
  },

  // ==================== Package Managers ====================
  {
    name: "apt_install",
    description: "Install packages with apt (Debian/Ubuntu)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Packages to install" },
        update: { type: "boolean", description: "Run apt update first" },
      },
      required: ["packages"],
    },
    handler: async ({ packages, update }) => {
      if (update) {
        await runCommand("apt", ["update"], { timeout: 120000 });
      }

      const result = await runCommand("apt", ["install", "-y", ...(packages as string[])], { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`apt install failed: ${result.stderr}`);
      }
      return { success: true, packages, output: result.stdout };
    },
  },
  {
    name: "apt_search",
    description: "Search for packages with apt",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
    handler: async ({ query }) => {
      const result = await runCommand("apt", ["search", query as string]);
      return { output: result.stdout };
    },
  },
  {
    name: "brew_install",
    description: "Install packages with Homebrew (macOS)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Packages to install" },
        cask: { type: "boolean", description: "Install as cask" },
      },
      required: ["packages"],
    },
    handler: async ({ packages, cask }) => {
      const args = cask ? ["install", "--cask"] : ["install"];
      args.push(...(packages as string[]));

      const result = await runCommand("brew", args, { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`brew install failed: ${result.stderr}`);
      }
      return { success: true, packages, output: result.stdout };
    },
  },

  // ==================== Text Processing ====================
  {
    name: "sed",
    description: "Stream editor for text transformation",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        expression: { type: "string", description: "sed expression (e.g., 's/old/new/g')" },
        inPlace: { type: "boolean", description: "Modify file in place" },
      },
      required: ["expression"],
    },
    handler: async ({ input, file, expression, inPlace }) => {
      if (input) {
        // Process string input via stdin
        const cmd = new Deno.Command("sed", {
          args: [expression as string],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        const args = inPlace ? ["-i", expression as string, file as string] : [expression as string, file as string];
        const result = await runCommand("sed", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "awk",
    description: "Pattern scanning and text processing",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        program: { type: "string", description: "awk program (e.g., '{print $1}')" },
        fieldSeparator: { type: "string", description: "Field separator (default: whitespace)" },
      },
      required: ["program"],
    },
    handler: async ({ input, file, program, fieldSeparator }) => {
      const args: string[] = [];
      if (fieldSeparator) args.push("-F", fieldSeparator as string);
      args.push(program as string);

      if (input) {
        const cmd = new Deno.Command("awk", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("awk", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "jq",
    description: "JSON processor",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "JSON input" },
        file: { type: "string", description: "Or JSON file path" },
        filter: { type: "string", description: "jq filter (e.g., '.name', '.[0]')" },
        raw: { type: "boolean", description: "Raw output (no quotes on strings)" },
      },
      required: ["filter"],
    },
    handler: async ({ input, file, filter, raw }) => {
      const args: string[] = [];
      if (raw) args.push("-r");
      args.push(filter as string);

      if (input) {
        const cmd = new Deno.Command("jq", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        const output = new TextDecoder().decode(stdout);
        const stderrStr = new TextDecoder().decode(stderr);
        try {
          return { result: JSON.parse(output) };
        } catch {
          return { output, stderr: stderrStr || undefined };
        }
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("jq", args);
        try {
          return { result: JSON.parse(result.stdout) };
        } catch {
          return { output: result.stdout, stderr: result.stderr || undefined };
        }
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "wc",
    description: "Word, line, character count",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        mode: {
          type: "string",
          enum: ["all", "lines", "words", "chars", "bytes"],
          description: "Count mode (default: all)",
        },
      },
    },
    handler: async ({ input, file, mode = "all" }) => {
      const args: string[] = [];
      switch (mode) {
        case "lines": args.push("-l"); break;
        case "words": args.push("-w"); break;
        case "chars": args.push("-m"); break;
        case "bytes": args.push("-c"); break;
      }

      if (input) {
        const cmd = new Deno.Command("wc", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        const output = new TextDecoder().decode(stdout).trim();
        const parts = output.split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n));

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2] };
        }
        return { count: parts[0] };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("wc", args);
        const parts = result.stdout.trim().split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n));

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2], file };
        }
        return { count: parts[0], file };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "head",
    description: "Get first N lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(0, lines as number).join("\n") };
      } else if (file) {
        const result = await runCommand("head", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "tail",
    description: "Get last N lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(-(lines as number)).join("\n") };
      } else if (file) {
        const result = await runCommand("tail", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "sort_lines",
    description: "Sort lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        reverse: { type: "boolean", description: "Reverse order" },
        numeric: { type: "boolean", description: "Numeric sort" },
        unique: { type: "boolean", description: "Remove duplicates" },
      },
    },
    handler: async ({ input, file, reverse, numeric, unique }) => {
      const args: string[] = [];
      if (reverse) args.push("-r");
      if (numeric) args.push("-n");
      if (unique) args.push("-u");

      if (input) {
        const cmd = new Deno.Command("sort", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("sort", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "uniq",
    description: "Filter or count unique lines",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text (should be sorted)" },
        file: { type: "string", description: "Or file path" },
        count: { type: "boolean", description: "Prefix lines with count" },
        duplicatesOnly: { type: "boolean", description: "Only show duplicates" },
      },
    },
    handler: async ({ input, file, count, duplicatesOnly }) => {
      const args: string[] = [];
      if (count) args.push("-c");
      if (duplicatesOnly) args.push("-d");

      if (input) {
        const cmd = new Deno.Command("uniq", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("uniq", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "cut",
    description: "Extract columns/fields from text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        delimiter: { type: "string", description: "Field delimiter (default: tab)" },
        fields: { type: "string", description: "Fields to extract (e.g., '1,3' or '2-4')" },
        characters: { type: "string", description: "Character positions (e.g., '1-10')" },
      },
    },
    handler: async ({ input, file, delimiter, fields, characters }) => {
      const args: string[] = [];
      if (delimiter) args.push("-d", delimiter as string);
      if (fields) args.push("-f", fields as string);
      if (characters) args.push("-c", characters as string);

      if (input) {
        const cmd = new Deno.Command("cut", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("cut", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "diff",
    description: "Compare two files",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file1: { type: "string", description: "First file" },
        file2: { type: "string", description: "Second file" },
        unified: { type: "boolean", description: "Unified format (default: true)" },
        context: { type: "number", description: "Lines of context (default: 3)" },
      },
      required: ["file1", "file2"],
    },
    handler: async ({ file1, file2, unified = true, context = 3 }) => {
      const args: string[] = [];
      if (unified) args.push("-u", `-U${context}`);
      args.push(file1 as string, file2 as string);

      const result = await runCommand("diff", args);
      return {
        identical: result.code === 0,
        diff: result.stdout,
      };
    },
  },
];
