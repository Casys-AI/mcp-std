/**
 * Process tools - process management and system info
 *
 * @module lib/std/tools/process
 */

import { type MiniTool, runCommand } from "./common.ts";

export const processTools: MiniTool[] = [
  {
    name: "ps_list",
    description:
      "List running processes with detailed resource usage. Shows CPU%, memory%, PID, user, and command for each process. Filter by name or user, sort by resource consumption. Use for finding resource-hungry processes, debugging, or monitoring system load. Keywords: ps aux, process list, running programs, CPU usage, memory usage, task manager, top processes.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "sort", "filter"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ filter, user, sort = "cpu", limit = 20 }) => {
      const sortField = { cpu: "-%cpu", mem: "-%mem", pid: "pid", time: "-time" }[sort as string] ||
        "-%cpu";
      const args = ["aux", "--sort", sortField];

      const result = await runCommand("ps", args);
      if (result.code !== 0) {
        throw new Error(`ps failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
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
    description:
      "Find the full path of an executable command. Checks if a command exists and returns its location in PATH. Use to verify command availability, find binary locations, or debug PATH issues. Keywords: which, command path, binary location, executable path, find command, PATH lookup.",
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
    name: "kill_process",
    description:
      "Terminate a process by PID or name using signals. Send SIGTERM for graceful shutdown or SIGKILL to force stop. Use to stop hung processes, restart services, or clean up runaway programs. Keywords: kill process, stop program, pkill, terminate, SIGTERM, SIGKILL, force quit, end task.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["copy"],
        accepts: [],
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
    description:
      "List open files, network connections, and ports in use. Find which process is using a specific port, file, or show all connections for a PID. Essential for debugging port conflicts, finding file locks, or auditing network activity. Keywords: lsof, open files, port in use, file handles, network connections, who is using port, file locks.",
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
      else args.push("-i");

      const result = await runCommand("lsof", args);

      const lines = result.stdout.trim().split("\n");
      if (lines.length < 2) return { processes: [] };

      const processes = lines.slice(1).map((line) => {
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
    description:
      "Find the location of a command in PATH. Shows the full path to an executable, optionally listing all matches. Use to check if a tool is installed, find where binaries are located, or resolve command conflicts. Keywords: which command, find binary, command location, executable path, PATH search.",
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

      const paths = result.stdout.trim().split("\n").filter((p) => p);
      return {
        found: true,
        command,
        path: paths[0],
        allPaths: all ? paths : undefined,
      };
    },
  },
  {
    name: "ps_tree",
    description:
      "Display process tree showing parent-child relationships. Shows hierarchical view of running processes with optional CPU/memory stats. Use for understanding process relationships, finding child processes, or debugging process hierarchies. Keywords: pstree, process tree, parent child, process hierarchy, fork tree, process relationships.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pid: {
          type: "number",
          description: "Root PID to start tree from (default: show all top-level processes)",
        },
        showThreads: {
          type: "boolean",
          description: "Include threads in the tree (default: false)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/tree-viewer",
        emits: ["select"],
        accepts: ["highlight", "expand"],
      },
    },
    handler: async ({ pid, showThreads }) => {
      // TreeNode interface for the tree-viewer component
      interface TreeNode {
        id: string;
        label: string;
        type: string;
        meta: Record<string, unknown>;
        children: TreeNode[];
      }

      interface ProcessInfo {
        pid: number;
        ppid: number;
        comm: string;
        pcpu: number;
        pmem: number;
        cmd: string;
      }

      // Get all processes with pid, ppid, command, cpu, mem
      const psArgs = [
        "-e",
        "-o",
        "pid,ppid,comm,pcpu,pmem,args",
        "--no-headers",
      ];

      // Add thread option if requested
      if (showThreads) {
        psArgs.unshift("-T");
      }

      const result = await runCommand("ps", psArgs);
      if (result.code !== 0) {
        throw new Error(`ps failed: ${result.stderr}`);
      }

      // Parse ps output into process map
      const processMap = new Map<number, ProcessInfo>();
      const lines = result.stdout.trim().split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse: PID PPID COMM %CPU %MEM CMD...
        const parts = trimmed.split(/\s+/);
        if (parts.length < 6) continue;

        const pidVal = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const comm = parts[2];
        const pcpu = parseFloat(parts[3]) || 0;
        const pmem = parseFloat(parts[4]) || 0;
        const cmd = parts.slice(5).join(" ");

        if (!isNaN(pidVal)) {
          processMap.set(pidVal, { pid: pidVal, ppid, comm, pcpu, pmem, cmd });
        }
      }

      // Build children map: ppid -> list of child pids
      const childrenMap = new Map<number, number[]>();
      for (const proc of processMap.values()) {
        const children = childrenMap.get(proc.ppid) || [];
        children.push(proc.pid);
        childrenMap.set(proc.ppid, children);
      }

      // Recursive function to build tree node
      const buildTreeNode = (procPid: number): TreeNode | null => {
        const proc = processMap.get(procPid);
        if (!proc) return null;

        const childPids = childrenMap.get(procPid) || [];
        const children: TreeNode[] = [];

        for (const childPid of childPids.sort((a, b) => a - b)) {
          const childNode = buildTreeNode(childPid);
          if (childNode) {
            children.push(childNode);
          }
        }

        return {
          id: String(proc.pid),
          label: proc.comm,
          type: "process",
          meta: {
            pid: proc.pid,
            ppid: proc.ppid,
            cpu: proc.pcpu,
            mem: proc.pmem,
            cmd: proc.cmd,
          },
          children,
        };
      };

      // If specific PID requested, build tree from that PID
      if (pid !== undefined && pid !== null) {
        const rootPid = pid as number;
        if (!processMap.has(rootPid)) {
          throw new Error(`Process ${rootPid} not found`);
        }

        const tree = buildTreeNode(rootPid);
        if (!tree) {
          throw new Error(`Failed to build tree for process ${rootPid}`);
        }

        return {
          tree,
          config: {
            icons: { process: "\u2699\uFE0F" },
            showMeta: true,
            expandDepth: 3,
          },
        };
      }

      // No PID specified: find all root processes (ppid=0 or ppid=1 or orphans)
      const rootPids: number[] = [];
      for (const proc of processMap.values()) {
        // Process is a root if its parent doesn't exist in our map or ppid is 0
        if (proc.ppid === 0 || !processMap.has(proc.ppid)) {
          rootPids.push(proc.pid);
        }
      }

      // Sort root PIDs
      rootPids.sort((a, b) => a - b);

      // If only one root (usually init/systemd), return it directly
      if (rootPids.length === 1) {
        const tree = buildTreeNode(rootPids[0]);
        if (!tree) {
          throw new Error("Failed to build process tree");
        }

        return {
          tree,
          config: {
            icons: { process: "\u2699\uFE0F" },
            showMeta: true,
            expandDepth: 2,
          },
        };
      }

      // Multiple roots: create a virtual root node
      const rootChildren: TreeNode[] = [];
      for (const rootPid of rootPids) {
        const node = buildTreeNode(rootPid);
        if (node) {
          rootChildren.push(node);
        }
      }

      const virtualRoot: TreeNode = {
        id: "root",
        label: "System Processes",
        type: "root",
        meta: {
          count: rootChildren.length,
        },
        children: rootChildren,
      };

      return {
        tree: virtualRoot,
        config: {
          icons: {
            root: "\uD83D\uDCBB",
            process: "\u2699\uFE0F",
          },
          showMeta: true,
          expandDepth: 2,
        },
      };
    },
  },
  {
    name: "top_snapshot",
    description:
      "Get a snapshot of top processes by CPU or memory usage. Returns a point-in-time view of the most resource-intensive processes, similar to 'top' command output. Use for identifying resource-hungry processes, performance troubleshooting, or system monitoring. Keywords: top processes, cpu usage, memory usage, process snapshot, system monitor, resource hogs, high cpu, high memory.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        sort_by: {
          type: "string",
          enum: ["cpu", "memory"],
          description: "Sort processes by CPU or memory usage (default: cpu)",
        },
        limit: {
          type: "number",
          description: "Number of top processes to return (default: 10)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "sort", "filter"],
        accepts: ["highlight", "refresh"],
      },
    },
    handler: async ({ sort_by = "cpu", limit = 10 }) => {
      const sortField = sort_by === "memory" ? "-%mem" : "-%cpu";
      const limitNum = typeof limit === "number" ? limit : 10;

      // Use ps to get a snapshot sorted by the specified field
      const result = await runCommand("ps", [
        "aux",
        "--sort",
        sortField,
      ]);

      if (result.code !== 0) {
        throw new Error(`ps failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const processes = lines.slice(1, limitNum + 1).map((line) => {
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

      // Calculate totals
      const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
      const totalMem = processes.reduce((sum, p) => sum + p.mem, 0);

      return {
        sort_by,
        processes,
        count: processes.length,
        summary: {
          totalCpuPercent: Math.round(totalCpu * 100) / 100,
          totalMemPercent: Math.round(totalMem * 100) / 100,
        },
      };
    },
  },
];
