/**
 * Documentation utilities for serving markdown docs
 * Similar to posts.ts but handles nested directory structure
 */

import { extract } from "@std/front-matter/yaml";
import { render } from "@deno/gfm";
import { join } from "@std/path";
import { deflate } from "pako";

// Import Prism language support for syntax highlighting
import "npm:prismjs@1.29.0/components/prism-typescript.js";
import "npm:prismjs@1.29.0/components/prism-javascript.js";
import "npm:prismjs@1.29.0/components/prism-bash.js";
import "npm:prismjs@1.29.0/components/prism-json.js";
import "npm:prismjs@1.29.0/components/prism-yaml.js";
import "npm:prismjs@1.29.0/components/prism-jsx.js";
import "npm:prismjs@1.29.0/components/prism-tsx.js";

export interface DocFrontmatter {
  title?: string;
  description?: string;
  order?: number;
}

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  content: string;
  html: string;
  breadcrumbs: { label: string; href: string }[];
  toc: TocItem[];
}

export interface DocNavItem {
  title: string;
  slug: string;
  href: string;
  order: number;
  children?: DocNavItem[];
}

// Use working directory for production compatibility
function getDocsDir(): string {
  const cwd = Deno.cwd();
  return cwd.endsWith("src/web")
    ? join(cwd, "../../docs/user-docs")
    : join(cwd, "docs/user-docs");
}

// Helper to create Kroki URL for diagrams
function createKrokiUrl(type: string, source: string): string {
  const data = new TextEncoder().encode(source);
  const compressed = deflate(data, { level: 9 });
  const result = btoa(Array.from(compressed, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `https://kroki.io/${type}/svg/${result}`;
}

// Pre-process markdown for mermaid diagrams
function preprocessMarkdown(markdown: string): string {
  // Match mermaid code blocks: ```mermaid\n...\n```
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;

  return markdown.replace(mermaidRegex, (_match, code) => {
    const url = createKrokiUrl("mermaid", code.trim());
    return `![Mermaid Diagram](${url})`;
  });
}

// Extract title from markdown content (first # heading)
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

// Generate slug from heading text
function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Extract table of contents from markdown
function extractToc(content: string): TocItem[] {
  const toc: TocItem[] = [];
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length; // 2 = h2, 3 = h3, 4 = h4
    const title = match[2].trim();
    const id = generateHeadingId(title);

    toc.push({ id, title, level });
  }

  return toc;
}

// Add IDs to headings in HTML
function addHeadingIds(html: string): string {
  // Match h2, h3, h4 tags and add IDs
  return html.replace(
    /<(h[234])>([^<]+)<\/h[234]>/g,
    (_match, tag, content) => {
      const id = generateHeadingId(content);
      return `<${tag} id="${id}">${content}</${tag}>`;
    }
  );
}

// Extract description from first paragraph
function extractDescription(content: string): string {
  // Skip title and find first paragraph
  const withoutTitle = content.replace(/^#\s+.+$/m, "").trim();
  const match = withoutTitle.match(/^([^#\n].+?)(?:\n\n|\n#|$)/s);
  if (match) {
    // Clean up the description (remove markdown links, etc.)
    return match[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
      .replace(/[*_`]/g, "") // Remove formatting
      .trim()
      .slice(0, 200);
  }
  return "";
}

// Parse order from filename (e.g., "01-installation.md" -> 1)
function parseOrder(filename: string): number {
  const match = filename.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : 999;
}

// Clean slug from filename (remove order prefix and .md)
function cleanSlug(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/^\d+-/, "");
}

// Build breadcrumbs from slug path
function buildBreadcrumbs(slugParts: string[]): { label: string; href: string }[] {
  const crumbs = [{ label: "Docs", href: "/docs" }];
  let path = "/docs";

  for (let i = 0; i < slugParts.length; i++) {
    path += "/" + slugParts[i];
    const label = slugParts[i]
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

// Fix internal doc links (convert relative .md links to /docs/ links)
function fixInternalLinks(html: string): string {
  // Match various relative link formats:
  // - ./path/to/file.md
  // - ../path/to/file.md
  // - path/to/file.md (without ./)
  return html.replace(
    /href="(\.\.?\/)?([^"]+)\.md"/g,
    (_match, _prefix, path) => {
      // Clean up path - remove leading order numbers from segments (01-, 02-, etc.)
      let cleanPath = path
        .split("/")
        .map((segment: string) => segment.replace(/^\d+-/, ""))
        .join("/");

      // Remove trailing /index or index
      cleanPath = cleanPath.replace(/\/index$/, "").replace(/^index$/, "");

      // Handle empty path (was just index.md)
      if (!cleanPath) {
        return 'href="/docs"';
      }

      return `href="/docs/${cleanPath}"`;
    }
  );
}

/**
 * Get a documentation page by its slug path
 */
export async function getDocPage(slugParts: string[]): Promise<DocPage | null> {
  const docsDir = getDocsDir();

  // Build possible file paths
  const possiblePaths: string[] = [];

  if (slugParts.length === 0) {
    // Root: /docs -> index.md
    possiblePaths.push(join(docsDir, "index.md"));
  } else {
    // Try exact path with various patterns
    const basePath = slugParts.join("/");

    // Direct match: concepts/learning/graphrag.md
    possiblePaths.push(join(docsDir, `${basePath}.md`));

    // With order prefix: concepts/03-learning/01-graphrag.md
    // We need to search for files that match the pattern
    try {
      // Recursively find the right directory
      const resolvedPath = await resolveDocPath(docsDir, slugParts);
      if (resolvedPath) {
        possiblePaths.unshift(resolvedPath);
      }
    } catch {
      // Ignore errors, we'll try other paths
    }

    // Index file in directory: concepts/learning/index.md
    possiblePaths.push(join(docsDir, basePath, "index.md"));
  }

  // Try each possible path
  for (const filePath of possiblePaths) {
    try {
      const content = await Deno.readTextFile(filePath);
      return parseDocContent(content, slugParts);
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Resolve a slug path to an actual file path (handling order prefixes)
 */
async function resolveDocPath(baseDir: string, slugParts: string[]): Promise<string | null> {
  let currentDir = baseDir;

  for (let i = 0; i < slugParts.length; i++) {
    const targetSlug = slugParts[i];
    const isLast = i === slugParts.length - 1;

    try {
      let found = false;

      for await (const entry of Deno.readDir(currentDir)) {
        const cleanName = cleanSlug(entry.name);

        if (isLast && entry.isFile && entry.name.endsWith(".md")) {
          // Looking for a file
          if (cleanName === targetSlug || entry.name === `${targetSlug}.md`) {
            return join(currentDir, entry.name);
          }
        } else if (!isLast && entry.isDirectory) {
          // Looking for a directory
          if (cleanName === targetSlug || entry.name === targetSlug) {
            currentDir = join(currentDir, entry.name);
            found = true;
            break;
          }
        } else if (isLast && entry.isDirectory) {
          // Could be an index.md inside a directory
          if (cleanName === targetSlug || entry.name === targetSlug) {
            const indexPath = join(currentDir, entry.name, "index.md");
            try {
              await Deno.stat(indexPath);
              return indexPath;
            } catch {
              // No index.md
            }
          }
        }
      }

      if (!isLast && !found) {
        return null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse markdown content into a DocPage
 */
function parseDocContent(content: string, slugParts: string[]): DocPage {
  let title: string;
  let description: string;
  let body: string;

  // Try to extract frontmatter
  try {
    const { attrs, body: extractedBody } = extract<DocFrontmatter>(content);
    title = attrs.title || extractTitle(extractedBody);
    description = attrs.description || extractDescription(extractedBody);
    body = extractedBody;
  } catch {
    // No frontmatter, extract from content
    title = extractTitle(content);
    description = extractDescription(content);
    body = content;
  }

  // Extract table of contents before processing
  const toc = extractToc(body);

  // Pre-process markdown (mermaid diagrams, etc.)
  const processedBody = preprocessMarkdown(body);

  // Render markdown to HTML
  let html = render(processedBody);

  // Fix internal links
  html = fixInternalLinks(html);

  // Add IDs to headings for TOC navigation
  html = addHeadingIds(html);

  return {
    slug: slugParts.join("/"),
    title,
    description,
    content: body,
    html,
    breadcrumbs: buildBreadcrumbs(slugParts),
    toc,
  };
}

/**
 * Build navigation tree from docs directory
 */
export async function getDocsNavigation(): Promise<DocNavItem[]> {
  const docsDir = getDocsDir();
  return await buildNavTree(docsDir, "");
}

async function buildNavTree(dir: string, basePath: string): Promise<DocNavItem[]> {
  const items: DocNavItem[] = [];

  try {
    const entries: { name: string; isDirectory: boolean; isFile: boolean }[] = [];

    for await (const entry of Deno.readDir(dir)) {
      entries.push({
        name: entry.name,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
      });
    }

    // Sort entries by order prefix
    entries.sort((a, b) => {
      const orderA = parseOrder(a.name);
      const orderB = parseOrder(b.name);
      return orderA - orderB;
    });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
        continue;
      }

      const cleanName = cleanSlug(entry.name);
      const order = parseOrder(entry.name);
      const href = basePath ? `${basePath}/${cleanName}` : cleanName;

      if (entry.isDirectory) {
        // Directory - recurse
        const children = await buildNavTree(join(dir, entry.name), href);

        // Try to get title from index.md
        let title = cleanName
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        try {
          const indexPath = join(dir, entry.name, "index.md");
          const indexContent = await Deno.readTextFile(indexPath);
          title = extractTitle(indexContent);
        } catch {
          // No index.md, use directory name
        }

        items.push({
          title,
          slug: cleanName,
          href: `/docs/${href}`,
          order,
          children: children.length > 0 ? children : undefined,
        });
      } else if (entry.isFile && entry.name.endsWith(".md") && entry.name !== "index.md") {
        // Markdown file (not index)
        try {
          const content = await Deno.readTextFile(join(dir, entry.name));
          const title = extractTitle(content);

          items.push({
            title,
            slug: cleanName,
            href: `/docs/${href}`,
            order,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (error) {
    console.error(`Error building nav tree for ${dir}:`, error);
  }

  return items;
}
