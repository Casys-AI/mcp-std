/**
 * XML Viewer UI for MCP Apps
 *
 * Interactive XML tree viewer with:
 * - Collapsible nodes
 * - Syntax highlighting (tags, attributes, values, text, comments)
 * - Indentation with guide lines
 * - Search/filter functionality
 * - Expand All / Collapse All
 * - Copy to clipboard
 *
 * @module lib/std/src/ui/xml-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface XmlNode {
  type: "element" | "text" | "comment" | "cdata" | "processing-instruction";
  name?: string;
  attributes?: Record<string, string>;
  children?: XmlNode[];
  value?: string;
  path: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "XML Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// XML Parser
// ============================================================================

/**
 * Simple XML parser that builds a tree structure.
 * Handles elements, attributes, text nodes, comments, and CDATA.
 */
function parseXml(xmlString: string): XmlNode | null {
  const trimmed = xmlString.trim();
  if (!trimmed) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "application/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(parseError.textContent || "XML parsing error");
    }

    return domNodeToXmlNode(doc.documentElement, "$");
  } catch (e) {
    throw new Error(`Failed to parse XML: ${e instanceof Error ? e.message : "Unknown error"}`);
  }
}

function domNodeToXmlNode(node: Node, path: string): XmlNode | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const xmlNode: XmlNode = {
      type: "element",
      name: element.tagName,
      path,
      attributes: {},
      children: [],
    };

    // Extract attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      xmlNode.attributes![attr.name] = attr.value;
    }

    // Extract children
    let childIndex = 0;
    for (let i = 0; i < element.childNodes.length; i++) {
      const childNode = element.childNodes[i];
      const childXml = domNodeToXmlNode(childNode, `${path}/${element.tagName}[${childIndex}]`);
      if (childXml) {
        xmlNode.children!.push(childXml);
        if (childXml.type === "element") {
          childIndex++;
        }
      }
    }

    return xmlNode;
  } else if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (!text) return null;
    return { type: "text", value: text, path: `${path}/#text` };
  } else if (node.nodeType === Node.COMMENT_NODE) {
    return { type: "comment", value: node.textContent || "", path: `${path}/#comment` };
  } else if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return { type: "cdata", value: node.textContent || "", path: `${path}/#cdata` };
  } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    const pi = node as ProcessingInstruction;
    return { type: "processing-instruction", name: pi.target, value: pi.data, path: `${path}/#pi` };
  }

  return null;
}

// ============================================================================
// XML Tree Node Component
// ============================================================================

function XmlTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchTerm,
}: {
  node: XmlNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, node: XmlNode) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;

  // Check if node matches search
  const matchesSearch = useMemo(() => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    if (node.name?.toLowerCase().includes(term)) return true;
    if (node.value?.toLowerCase().includes(term)) return true;
    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key.toLowerCase().includes(term) || value.toLowerCase().includes(term)) {
          return true;
        }
      }
    }
    return false;
  }, [node, searchTerm]);

  // Render different node types
  if (node.type === "text") {
    return (
      <div
        className={cx(
          "py-1 font-mono text-sm text-fg-default",
          matchesSearch && "bg-yellow-100 dark:bg-yellow-900/30"
        )}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {node.value}
      </div>
    );
  }

  if (node.type === "comment") {
    return (
      <div
        className={cx(
          "py-1 font-mono text-sm text-gray-500 italic",
          matchesSearch && "bg-yellow-100 dark:bg-yellow-900/30"
        )}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {"<!-- "}{node.value}{" -->"}
      </div>
    );
  }

  if (node.type === "cdata") {
    return (
      <div
        className={cx(
          "py-1 font-mono text-sm text-gray-600 dark:text-gray-400",
          matchesSearch && "bg-yellow-100 dark:bg-yellow-900/30"
        )}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {"<![CDATA["}{node.value}{"]]>"}
      </div>
    );
  }

  if (node.type === "processing-instruction") {
    return (
      <div
        className="py-1 font-mono text-sm text-gray-500"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {"<?"}{node.name} {node.value}{"?>"}
      </div>
    );
  }

  // Element node
  const hasOnlyTextChild = node.children?.length === 1 && node.children[0].type === "text";
  const isEmpty = !node.children || node.children.length === 0;

  return (
    <div className="relative">
      {/* Indent guide line */}
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-border-default opacity-30"
          style={{ left: `${(depth - 1) * 20 + 8}px` }}
        />
      )}

      <div
        className={cx(
          "flex items-start gap-0 py-1 pr-2 rounded-sm font-mono text-sm",
          hasChildren && !hasOnlyTextChild ? "cursor-pointer" : "cursor-default",
          matchesSearch ? "bg-yellow-100 dark:bg-yellow-900/30" : "hover:bg-bg-subtle"
        )}
        style={{ paddingLeft: `${depth * 20}px` }}
        onClick={() => {
          if (hasChildren && !hasOnlyTextChild) {
            onToggle(node.path);
          } else {
            onSelect(node.path, node);
          }
        }}
      >
        {/* Expand/collapse icon */}
        {hasChildren && !hasOnlyTextChild ? (
          <span className="w-4 text-fg-muted text-xs shrink-0 select-none mr-1">
            {isExpanded ? "v" : ">"}
          </span>
        ) : (
          <span className="w-4 shrink-0 mr-1" />
        )}

        {/* Opening tag */}
        <span className="text-fg-muted">{"<"}</span>
        <span className="text-blue-600 dark:text-blue-400 font-medium">{node.name}</span>

        {/* Attributes */}
        {node.attributes && Object.keys(node.attributes).length > 0 && (
          <>
            {Object.entries(node.attributes).map(([key, value]) => (
              <span key={key}>
                <span className="text-fg-default"> </span>
                <span className="text-purple-600 dark:text-purple-400">{key}</span>
                <span className="text-fg-muted">=</span>
                <span className="text-green-600 dark:text-green-400">"{value}"</span>
              </span>
            ))}
          </>
        )}

        {/* Self-closing or with inline text */}
        {isEmpty ? (
          <span className="text-fg-muted">{" />"}</span>
        ) : hasOnlyTextChild ? (
          <>
            <span className="text-fg-muted">{">"}</span>
            <span className="text-fg-default">{node.children![0].value}</span>
            <span className="text-fg-muted">{"</"}</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">{node.name}</span>
            <span className="text-fg-muted">{">"}</span>
          </>
        ) : (
          <>
            <span className="text-fg-muted">{">"}</span>
            {!isExpanded && (
              <span className="text-fg-muted text-xs ml-1">
                ({node.children!.length} children)
              </span>
            )}
          </>
        )}
      </div>

      {/* Children */}
      {hasChildren && !hasOnlyTextChild && isExpanded && (
        <>
          {node.children!.map((child, index) => (
            <XmlTreeNode
              key={`${child.path}-${index}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}

          {/* Closing tag */}
          <div
            className="py-1 font-mono text-sm"
            style={{ paddingLeft: `${depth * 20 + 20}px` }}
          >
            <span className="text-fg-muted">{"</"}</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">{node.name}</span>
            <span className="text-fg-muted">{">"}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function XmlViewer() {
  const [data, setData] = useState<XmlNode | null>(null);
  const [rawXml, setRawXml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[xml-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[xml-viewer] No MCP host (standalone mode)");
        // Load demo data in standalone mode
        const demoXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" category="fiction">
    <author>Gambardella, Matthew</author>
    <title>XML Developer's Guide</title>
    <genre>Computer</genre>
    <price>44.95</price>
    <publish_date>2000-10-01</publish_date>
    <description>An in-depth look at creating applications with XML.</description>
  </book>
  <book id="bk102" category="fiction">
    <author>Ralls, Kim</author>
    <title>Midnight Rain</title>
    <genre>Fantasy</genre>
    <price>5.95</price>
    <publish_date>2000-12-16</publish_date>
    <description>A former architect battles corporate zombies.</description>
  </book>
  <!-- This is a comment -->
  <book id="bk103" category="non-fiction">
    <author>Corets, Eva</author>
    <title>Maeve Ascendant</title>
    <genre>Fantasy</genre>
    <price>5.95</price>
    <publish_date>2000-11-17</publish_date>
    <description>After the collapse of a nanotechnology society, young survivors rebuild.</description>
  </book>
  <metadata>
    <version>1.0</version>
    <last_updated>2026-02-03</last_updated>
    <status active="true" />
  </metadata>
</catalog>`;
        setRawXml(demoXml);
        try {
          const parsed = parseXml(demoXml);
          setData(parsed);
          setExpanded(new Set(["$"]));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
        setLoading(false);
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          setRawXml("");
          return;
        }

        const text = textContent.text;
        setRawXml(text);
        const parsed = parseXml(text);
        setData(parsed);
        setExpanded(new Set(["$"]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Handlers
  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((path: string, node: XmlNode) => {
    setSelectedPath(path);
    notifyModel("select", { path, node: { type: node.type, name: node.name, value: node.value } });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!data) return;
    const paths = collectPaths(data);
    setExpanded(new Set(paths));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set(["$"]));
  }, []);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(rawXml).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(null), 2000);
      notifyModel("copy", { content: "xml" });
    });
  }, [rawXml]);

  // Render
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">Loading XML...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">No XML data</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search tags, attributes, or values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          className="flex-1 min-w-[150px] px-3 py-2 text-sm border border-border-default rounded-md bg-bg-canvas text-fg-default placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button variant="outline" size="sm" onClick={handleExpandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={handleCollapseAll}>
          Collapse
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
          {copyStatus || "Copy"}
        </Button>
      </div>

      {/* Selected path */}
      {selectedPath && (
        <div className="flex gap-2 items-center mb-2 p-2 bg-bg-subtle rounded-md">
          <span className="text-fg-muted text-xs">Path:</span>
          <code className="font-mono text-xs text-blue-600 dark:text-blue-400">
            {selectedPath}
          </code>
        </div>
      )}

      {/* Tree */}
      <div className="border border-border-default rounded-lg p-3 bg-bg-canvas overflow-x-auto font-mono text-sm">
        <XmlTreeNode
          node={data}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={handleSelect}
          searchTerm={searchTerm}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function collectPaths(node: XmlNode): string[] {
  const paths = [node.path];
  if (node.children) {
    node.children.forEach((child) => paths.push(...collectPaths(child)));
  }
  return paths;
}

// ============================================================================
// Mount
// ============================================================================

render(<XmlViewer />, document.getElementById("app")!);
