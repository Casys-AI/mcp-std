/**
 * QR Viewer UI - Display QR codes
 *
 * Renders QR codes from:
 * - SVG string
 * - Data URL (base64)
 * - ASCII art
 *
 * Features:
 * - Download button
 * - Copy data
 * - Size adjustment
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/qr-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface QRData {
  // SVG content or data URL
  svg?: string;
  dataUrl?: string;
  ascii?: string;

  // Original data encoded
  data?: string;

  // Metadata
  size?: number;
  errorCorrection?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "QR Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Main Component
// ============================================================================

function QRViewer() {
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [displaySize, setDisplaySize] = useState(200);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(textContent.text);
            setQrData(parsed);
          } catch {
            // Might be raw SVG or ASCII
            const text = textContent.text;
            if (text.trim().startsWith("<svg") || text.trim().startsWith("<?xml")) {
              setQrData({ svg: text });
            } else if (text.includes("\u2588") || text.includes("\u2580") || text.includes("##")) {
              setQrData({ ascii: text });
            } else {
              setQrData({ data: text });
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse QR data", e);
      }
    };
  }, []);

  const copyData = useCallback(() => {
    if (qrData?.data) {
      navigator.clipboard.writeText(qrData.data);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      notifyModel("copy", { data: qrData.data });
    }
  }, [qrData]);

  const downloadSvg = useCallback(() => {
    if (qrData?.svg) {
      const blob = new Blob([qrData.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qrcode.svg";
      a.click();
      URL.revokeObjectURL(url);
      notifyModel("download", { format: "svg" });
    }
  }, [qrData]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 items-center justify-center p-4 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-6 text-fg-muted">Loading QR...</div>
      </div>
    );
  }

  if (!qrData) {
    return (
      <div className="flex flex-col gap-3 items-center justify-center p-4 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-6 text-fg-muted">No QR code</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 p-4 font-sans text-sm text-fg-default bg-bg-canvas">
      {/* QR Display */}
      <div className="p-4 bg-white rounded-lg shadow-sm border border-border-default">
        {qrData.svg && (
          <div
            className="block [&_svg]:w-full [&_svg]:h-full"
            style={{ width: displaySize, height: displaySize }}
            dangerouslySetInnerHTML={{ __html: qrData.svg }}
          />
        )}

        {qrData.dataUrl && (
          <img
            src={qrData.dataUrl}
            alt="QR Code"
            style={{ width: displaySize, height: displaySize, display: "block" }}
          />
        )}

        {qrData.ascii && (
          <pre
            className="font-mono whitespace-pre text-black"
            style={{ fontSize: "4px", lineHeight: "4px", letterSpacing: "-1px" }}
          >
            {qrData.ascii}
          </pre>
        )}

        {!qrData.svg && !qrData.dataUrl && !qrData.ascii && qrData.data && (
          <div className="flex flex-col items-center gap-2 p-8 text-fg-muted">
            <div className="text-4xl">{"\u2B1C"}</div>
            <div>QR for: {qrData.data.slice(0, 30)}{qrData.data.length > 30 ? "..." : ""}</div>
          </div>
        )}
      </div>

      {/* Data display */}
      {qrData.data && (
        <div className="w-full max-w-[300px]">
          <div className="text-xs text-fg-muted mb-1">Encoded data:</div>
          <div className="p-2 bg-bg-subtle rounded-md font-mono text-xs break-all">
            {qrData.data.length > 100 ? qrData.data.slice(0, 100) + "..." : qrData.data}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2 w-full max-w-[300px]">
        {/* Size slider */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted min-w-[70px]">Size: {displaySize}px</label>
          <input
            type="range"
            min="100"
            max="400"
            value={displaySize}
            onChange={(e) => setDisplaySize(parseInt((e.target as HTMLInputElement).value, 10))}
            className={cx(
              "flex-1 h-1 bg-bg-muted rounded-full cursor-pointer appearance-none",
              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
              "[&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
            )}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-center">
          {qrData.data && (
            <Button variant="outline" size="sm" onClick={copyData}>
              {copied ? "Copied" : "Copy data"}
            </Button>
          )}
          {qrData.svg && (
            <Button variant="outline" size="sm" onClick={downloadSvg}>
              Download SVG
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      {(qrData.errorCorrection || qrData.size) && (
        <div className="flex gap-3 text-xs text-fg-muted">
          {qrData.errorCorrection && <div>EC: {qrData.errorCorrection}</div>}
          {qrData.size && <div>Size: {qrData.size}x{qrData.size}</div>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<QRViewer />, document.getElementById("app")!);
