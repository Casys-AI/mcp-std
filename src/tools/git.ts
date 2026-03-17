/**
 * Git tools - repository management
 *
 * @module lib/std/tools/git
 */

import { type MiniTool, runCommand } from "./common.ts";

export const gitTools: MiniTool[] = [
  {
    name: "git_status",
    description:
      "Get git repository status showing working directory state. Shows current branch, tracked/untracked files, staged changes, and upstream tracking info. Use to check what files are modified, staged for commit, or need attention before committing. Keywords: git status, working tree, staged files, uncommitted changes, modified files.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        short: { type: "boolean", description: "Short format output" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "stage", "unstage"],
        accepts: ["filter"],
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
    description:
      "Get git commit history with author, date, and message details. View recent commits, filter by author or date range, track project evolution. Use to review changes, find specific commits, audit code history, or understand what was changed and when. Keywords: commit history, git log, revision history, changelog, commit messages, author commits.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "viewDetails", "copy"],
        accepts: ["filter", "sort"],
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
    description:
      "Show git diff between commits, branches, or working directory changes. View line-by-line differences, staged vs unstaged changes, or file-specific diffs. Use to review code changes before committing, compare versions, or understand what was modified. Keywords: git diff, code changes, line differences, compare files, staged changes, patch.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/diff-viewer",
        emits: ["navigate", "copy", "toggleMode"],
        accepts: ["goToChange", "setMode"],
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
    description:
      "List git branches showing local and remote branches. Shows current branch, upstream tracking, and all available branches. Use to see available branches, check current branch, find feature branches, or verify remote tracking. Keywords: git branch, branch list, current branch, remote branches, feature branches, branch management.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        all: { type: "boolean", description: "Show all branches including remote" },
        current: { type: "boolean", description: "Show current branch only" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "checkout", "delete"],
        accepts: ["filter"],
      },
    },
    handler: async ({ cwd, all = false, current = false }) => {
      if (current) {
        const result = await runCommand("git", ["branch", "--show-current"], {
          cwd: cwd as string,
        });
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
  {
    name: "git_blame",
    description:
      "Show git blame annotations for a file with per-line commit information. View who last modified each line, when, and in which commit. Use to understand code authorship, find who introduced specific changes, or trace the history of individual lines. Keywords: git blame, line history, code authorship, who changed, annotate, line-by-line history.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        file: { type: "string", description: "File path to blame (required)" },
        startLine: { type: "number", description: "Start line number (optional, 1-indexed)" },
        endLine: { type: "number", description: "End line number (optional, inclusive)" },
      },
      required: ["file"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/blame-viewer",
        emits: ["select", "viewCommit", "copy"],
        accepts: ["goToLine", "highlight"],
      },
    },
    handler: async ({ cwd, file, startLine, endLine }) => {
      if (!file) {
        throw new Error("file parameter is required");
      }

      const args = ["blame", "--porcelain"];

      // Add line range if specified
      if (startLine !== undefined && endLine !== undefined) {
        args.push(`-L${startLine},${endLine}`);
      } else if (startLine !== undefined) {
        args.push(`-L${startLine},`);
      }

      args.push(file as string);

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git blame failed: ${result.stderr}`);
      }

      // Parse porcelain output
      const lines = result.stdout.split("\n");
      const blameLines: Array<{
        lineNumber: number;
        commitHash: string;
        author: string;
        authorEmail: string;
        timestamp: number;
        content: string;
        summary: string;
      }> = [];

      // Commit info cache (porcelain only provides full info on first occurrence)
      const commitCache: Record<string, {
        author: string;
        authorEmail: string;
        timestamp: number;
        summary: string;
      }> = {};

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line) {
          i++;
          continue;
        }

        // First line of each entry: <hash> <origLine> <finalLine> [<numLines>]
        const headerMatch = line.match(/^([a-f0-9]{40})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/);
        if (!headerMatch) {
          i++;
          continue;
        }

        const commitHash = headerMatch[1];
        const lineNumber = parseInt(headerMatch[3], 10);
        let author = "";
        let authorEmail = "";
        let timestamp = 0;
        let summary = "";
        let content = "";

        i++;

        // Read header lines until we hit the content line (starts with tab)
        while (i < lines.length && !lines[i].startsWith("\t")) {
          const headerLine = lines[i];
          if (headerLine.startsWith("author ")) {
            author = headerLine.slice(7);
          } else if (headerLine.startsWith("author-mail ")) {
            authorEmail = headerLine.slice(12).replace(/[<>]/g, "");
          } else if (headerLine.startsWith("author-time ")) {
            timestamp = parseInt(headerLine.slice(12), 10);
          } else if (headerLine.startsWith("summary ")) {
            summary = headerLine.slice(8);
          }
          i++;
        }

        // Content line (starts with tab)
        if (i < lines.length && lines[i].startsWith("\t")) {
          content = lines[i].slice(1);
          i++;
        }

        // Cache commit info on first occurrence
        if (!commitCache[commitHash] && author) {
          commitCache[commitHash] = { author, authorEmail, timestamp, summary };
        }

        // Use cached info if this is a repeat commit
        const cached = commitCache[commitHash];
        if (cached && !author) {
          author = cached.author;
          authorEmail = cached.authorEmail;
          timestamp = cached.timestamp;
          summary = cached.summary;
        }

        blameLines.push({
          lineNumber,
          commitHash,
          author: author || cached?.author || "Unknown",
          authorEmail: authorEmail || cached?.authorEmail || "",
          timestamp: timestamp || cached?.timestamp || 0,
          content,
          summary: summary || cached?.summary || "",
        });
      }

      return {
        file: file as string,
        lines: blameLines,
        totalLines: blameLines.length,
      };
    },
  },
  {
    name: "git_graph",
    description:
      "Get git commit graph visualization showing branch history and merges. Shows commits as a DAG (directed acyclic graph) with branch/merge topology, refs (branches, tags), and commit messages. Use to visualize repository history, understand branching strategy, find merge points, or explore project evolution visually. Keywords: git graph, commit graph, branch visualization, git history, DAG, merge history, branch topology.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        maxCount: { type: "number", description: "Maximum number of commits (default: 50)" },
        all: { type: "boolean", description: "Show all branches including remote (default: true)" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/commit-graph",
        emits: ["select", "viewCommit", "expandBranch"],
        accepts: ["scrollTo", "highlight", "filter"],
      },
    },
    handler: async ({ cwd, maxCount = 50, all = true }) => {
      // Get commit graph with format:
      // %H  = full hash
      // %h  = short hash
      // %P  = parent hashes
      // %d  = ref names (branches, tags)
      // %s  = subject (commit message first line)
      // %an = author name
      // %at = author timestamp
      const format = "--format=%H|%h|%P|%d|%s|%an|%at";
      const args = ["log", format, `--max-count=${maxCount}`];
      if (all) args.push("--all");

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git log failed: ${result.stderr}`);
      }

      // Also get graph ASCII representation for topology
      const graphArgs = ["log", "--graph", "--oneline", `--max-count=${maxCount}`];
      if (all) graphArgs.push("--all");
      const graphResult = await runCommand("git", graphArgs, { cwd: cwd as string });

      // Parse commits
      const commitLines = result.stdout.trim().split("\n").filter(Boolean);
      const graphLines = graphResult.stdout.trim().split("\n").filter(Boolean);

      // Extract graph characters and short hash from graph output
      const graphMap = new Map<string, string>();
      for (const line of graphLines) {
        // Graph line format: "* | | abc1234 commit message" or "|\\ " etc.
        // Find the short hash (7 chars) in the line
        const hashMatch = line.match(/([a-f0-9]{7,})/);
        if (hashMatch) {
          const shortHash = hashMatch[1].slice(0, 7);
          // Everything before the hash is graph characters
          const graphIdx = line.indexOf(hashMatch[0]);
          const graphChars = line.slice(0, graphIdx).trimEnd();
          graphMap.set(shortHash, graphChars);
        }
      }

      const commits: Array<{
        hash: string;
        shortHash: string;
        message: string;
        refs: string[];
        graphChars: string;
        parents: string[];
        author: string;
        timestamp: number;
      }> = [];

      const branchSet = new Set<string>();

      for (const line of commitLines) {
        const parts = line.split("|");
        if (parts.length < 7) continue;

        const hash = parts[0];
        const shortHash = parts[1];
        const parentStr = parts[2];
        const refStr = parts[3];
        const message = parts[4];
        const author = parts[5];
        const timestamp = parseInt(parts[6], 10);

        // Parse refs: " (HEAD -> main, origin/main, tag: v1.0)"
        const refs: string[] = [];
        if (refStr.trim()) {
          const refMatch = refStr.match(/\(([^)]+)\)/);
          if (refMatch) {
            const refParts = refMatch[1].split(",").map((r) => r.trim());
            for (const ref of refParts) {
              // Clean up ref names
              const cleanRef = ref
                .replace("HEAD -> ", "")
                .replace("tag: ", "tag:")
                .trim();
              if (cleanRef) {
                refs.push(cleanRef);
                // Track branches (not tags)
                if (!cleanRef.startsWith("tag:")) {
                  branchSet.add(cleanRef);
                }
              }
            }
          }
        }

        const parents = parentStr.trim() ? parentStr.trim().split(" ") : [];
        const graphChars = graphMap.get(shortHash) || "*";

        commits.push({
          hash,
          shortHash,
          message,
          refs,
          graphChars,
          parents,
          author,
          timestamp,
        });
      }

      // Get all local branches
      const branchResult = await runCommand("git", ["branch", "--format=%(refname:short)"], {
        cwd: cwd as string,
      });
      const localBranches = branchResult.stdout.trim().split("\n").filter(Boolean);
      for (const b of localBranches) {
        branchSet.add(b);
      }

      return {
        commits,
        branches: Array.from(branchSet).sort(),
        totalCommits: commits.length,
      };
    },
  },
  {
    name: "git_contributors",
    description:
      "Get git repository contributors with commit counts. Shows all contributors sorted by number of commits. Use to analyze team contributions, identify active contributors, or generate contribution reports. Keywords: git contributors, commit count, authors, team stats, contribution analysis, committers.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Repository path" },
        since: {
          type: "string",
          description: "Show contributors since date (e.g., '1 year ago', '2024-01-01')",
        },
        until: {
          type: "string",
          description: "Show contributors until date (e.g., '2025-01-01', '1 month ago')",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/chart-viewer",
        emits: ["select", "viewDetails", "export"],
        accepts: ["filter", "sort"],
      },
    },
    handler: async ({ cwd, since, until }) => {
      const args = ["shortlog", "-sne", "--all"];

      if (since) args.push(`--since=${since}`);
      if (until) args.push(`--until=${until}`);

      const result = await runCommand("git", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`git shortlog failed: ${result.stderr}`);
      }

      // Parse output format: "   100\tJohn Doe <john@example.com>"
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const contributors: Array<{
        name: string;
        email: string;
        commits: number;
      }> = [];

      let totalCommits = 0;

      for (const line of lines) {
        // Match: leading whitespace, number, tab, name <email>
        const match = line.match(/^\s*(\d+)\t(.+?)\s+<([^>]+)>$/);
        if (match) {
          const commits = parseInt(match[1], 10);
          const name = match[2].trim();
          const email = match[3].trim();

          contributors.push({ name, email, commits });
          totalCommits += commits;
        }
      }

      return {
        contributors,
        totalCommits,
        totalContributors: contributors.length,
      };
    },
  },
  {
    name: "git_stash_list",
    description:
      "List all git stashes in the repository. Shows stash index, branch where stash was created, and stash message. Use to see saved work-in-progress changes, find stashes to apply or drop, or review temporary saves. Keywords: git stash, stash list, saved changes, work in progress, WIP, temporary saves.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Repository path (default: current directory)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "apply", "drop"],
        accepts: ["filter"],
      },
    },
    handler: async ({ path = "." }) => {
      // Use format to get structured stash info
      // %gd = reflog selector (stash@{0})
      // %gs = reflog subject (stash message)
      // %ci = committer date ISO format
      const args = [
        "stash",
        "list",
        "--format=%gd|%gs|%ci",
      ];

      const result = await runCommand("git", args, { cwd: path as string });
      if (result.code !== 0) {
        throw new Error(`git stash list failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const stashes: Array<{
        index: number;
        ref: string;
        message: string;
        date: string;
      }> = [];

      for (const line of lines) {
        const parts = line.split("|");
        if (parts.length >= 3) {
          const ref = parts[0]; // stash@{0}
          const message = parts[1]; // WIP on branch: message or On branch: message
          const date = parts[2]; // ISO date

          // Extract index from ref (stash@{0} -> 0)
          const indexMatch = ref.match(/stash@\{(\d+)\}/);
          const index = indexMatch ? parseInt(indexMatch[1], 10) : stashes.length;

          stashes.push({
            index,
            ref,
            message,
            date,
          });
        }
      }

      return {
        stashes,
        count: stashes.length,
      };
    },
  },
  {
    name: "git_file_history",
    description:
      "Get commit history for a specific file, following renames across history. Shows all commits that modified the file with author, date, and message. Use to track file evolution, find when changes were introduced, or understand file-specific history. Keywords: file history, git log file, file commits, track changes, file evolution, rename tracking.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Repository path (default: current directory)",
        },
        file: {
          type: "string",
          description: "File path relative to repository root (required)",
        },
        limit: {
          type: "number",
          description: "Maximum number of commits to return (default: 50)",
        },
      },
      required: ["file"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "viewCommit", "viewDiff"],
        accepts: ["filter", "sort"],
      },
    },
    handler: async ({ path = ".", file, limit = 50 }) => {
      if (!file) {
        throw new Error("file parameter is required");
      }

      // Use --follow to track file across renames
      // Format: hash|author|email|timestamp|subject
      const args = [
        "log",
        "--follow",
        `--max-count=${limit}`,
        "--format=%H|%an|%ae|%at|%s",
        "--",
        file as string,
      ];

      const result = await runCommand("git", args, { cwd: path as string });
      if (result.code !== 0) {
        throw new Error(`git log failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const commits: Array<{
        hash: string;
        author: string;
        email: string;
        date: string;
        message: string;
      }> = [];

      for (const line of lines) {
        const [hash, author, email, timestamp, ...messageParts] = line.split("|");
        if (hash && author && timestamp) {
          commits.push({
            hash,
            author,
            email: email || "",
            date: new Date(parseInt(timestamp, 10) * 1000).toISOString(),
            message: messageParts.join("|"),
          });
        }
      }

      return {
        file: file as string,
        commits,
        count: commits.length,
      };
    },
  },
];
