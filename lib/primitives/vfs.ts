/**
 * Virtual Filesystem (VFS) tools
 *
 * In-memory file operations for sandboxed environments.
 *
 * @module lib/primitives/vfs
 */

import type { MiniTool } from "./types.ts";

// In-memory virtual filesystem storage
const vfsStorage = new Map<string, { content: string; createdAt: Date; updatedAt: Date }>();

export const vfsTools: MiniTool[] = [
  {
    name: "vfs_write",
    description: "Write content to a virtual file",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Virtual file path" },
        content: { type: "string", description: "Content to write" },
        append: { type: "boolean", description: "Append instead of overwrite (default: false)" },
      },
      required: ["path", "content"],
    },
    handler: ({ path, content, append = false }) => {
      const p = path as string;
      const c = content as string;
      const now = new Date();

      if (append && vfsStorage.has(p)) {
        const existing = vfsStorage.get(p)!;
        vfsStorage.set(p, {
          content: existing.content + c,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
      } else {
        vfsStorage.set(p, {
          content: c,
          createdAt: vfsStorage.get(p)?.createdAt || now,
          updatedAt: now,
        });
      }
      return { success: true, path: p, size: vfsStorage.get(p)!.content.length };
    },
  },
  {
    name: "vfs_read",
    description: "Read content from a virtual file",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Virtual file path" },
      },
      required: ["path"],
    },
    handler: ({ path }) => {
      const p = path as string;
      const file = vfsStorage.get(p);
      if (!file) {
        return { error: `File not found: ${p}`, exists: false };
      }
      return { content: file.content, exists: true, size: file.content.length };
    },
  },
  {
    name: "vfs_delete",
    description: "Delete a virtual file",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Virtual file path" },
      },
      required: ["path"],
    },
    handler: ({ path }) => {
      const p = path as string;
      const existed = vfsStorage.delete(p);
      return { success: existed, deleted: p };
    },
  },
  {
    name: "vfs_list",
    description: "List virtual files matching a pattern",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g., '*.txt', 'dir/*')" },
      },
    },
    handler: ({ pattern }) => {
      const files = Array.from(vfsStorage.entries()).map(([path, meta]) => ({
        path,
        size: meta.content.length,
        createdAt: meta.createdAt.toISOString(),
        updatedAt: meta.updatedAt.toISOString(),
      }));

      if (!pattern) return files;

      // Simple glob matching
      const p = pattern as string;
      const regex = new RegExp(
        "^" + p.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      );
      return files.filter((f) => regex.test(f.path));
    },
  },
  {
    name: "vfs_exists",
    description: "Check if a virtual file exists",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Virtual file path" },
      },
      required: ["path"],
    },
    handler: ({ path }) => ({
      exists: vfsStorage.has(path as string),
      path,
    }),
  },
  {
    name: "vfs_copy",
    description: "Copy a virtual file",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
      },
      required: ["source", "destination"],
    },
    handler: ({ source, destination }) => {
      const src = source as string;
      const dest = destination as string;
      const file = vfsStorage.get(src);
      if (!file) {
        return { error: `Source not found: ${src}`, success: false };
      }
      const now = new Date();
      vfsStorage.set(dest, {
        content: file.content,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, source: src, destination: dest };
    },
  },
  {
    name: "vfs_move",
    description: "Move/rename a virtual file",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
      },
      required: ["source", "destination"],
    },
    handler: ({ source, destination }) => {
      const src = source as string;
      const dest = destination as string;
      const file = vfsStorage.get(src);
      if (!file) {
        return { error: `Source not found: ${src}`, success: false };
      }
      vfsStorage.set(dest, file);
      vfsStorage.delete(src);
      return { success: true, source: src, destination: dest };
    },
  },
  {
    name: "vfs_clear",
    description: "Clear all virtual files or files matching pattern",
    category: "vfs",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to match (clears all if omitted)" },
      },
    },
    handler: ({ pattern }) => {
      if (!pattern) {
        const count = vfsStorage.size;
        vfsStorage.clear();
        return { cleared: count };
      }
      const p = pattern as string;
      const regex = new RegExp(
        "^" + p.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      );
      let count = 0;
      for (const path of vfsStorage.keys()) {
        if (regex.test(path)) {
          vfsStorage.delete(path);
          count++;
        }
      }
      return { cleared: count, pattern: p };
    },
  },
];
