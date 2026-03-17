/**
 * Image Preview UI for MCP Apps
 *
 * Display decoded base64 images with:
 * - Image display
 * - Metadata (size, dimensions, type)
 * - Zoom in/out controls
 * - Download button
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/image-preview
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ImageData {
  valid: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
  dataUri: string;
  error?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Image Preview", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getMimeTypeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
  };
  return labels[mimeType] || mimeType;
}

// ============================================================================
// Main Component
// ============================================================================

function ImagePreview() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const imageRef = useRef<HTMLImageElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[image-preview] Connected to MCP host");
    }).catch(() => {
      console.log("[image-preview] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text) as ImageData;
          setImageData(parsed);
          setZoom(100); // Reset zoom on new image
        }
      } catch (e) {
        console.error("Failed to parse image data", e);
        setImageData({
          valid: false,
          mimeType: "",
          size: 0,
          dataUri: "",
          error: "Failed to parse tool result",
        });
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 400));
    notifyModel("zoom", { direction: "in", level: Math.min(zoom + 25, 400) });
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 25));
    notifyModel("zoom", { direction: "out", level: Math.max(zoom - 25, 25) });
  }, [zoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
    notifyModel("zoom", { direction: "reset", level: 100 });
  }, []);

  // Download handler
  const handleDownload = useCallback(() => {
    if (!imageData?.dataUri) return;

    const link = document.createElement("a");
    link.href = imageData.dataUri;

    // Determine file extension from MIME type
    const ext = imageData.mimeType.split("/")[1] || "png";
    link.download = `image.${ext}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notifyModel("download", {
      mimeType: imageData.mimeType,
      size: imageData.size,
    });
  }, [imageData]);

  // Render states
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex items-center justify-center p-10 text-fg-muted">Loading image...</div>
      </div>
    );
  }

  if (!imageData) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex items-center justify-center p-10 text-fg-muted">No image data</div>
      </div>
    );
  }

  if (!imageData.valid || imageData.error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex flex-col gap-2 items-center p-6 bg-red-50 dark:bg-red-950 rounded-lg text-center">
          <div className="flex items-center justify-center w-10 h-10 text-xl font-bold text-red-500 dark:text-red-300 bg-red-100 dark:bg-red-900 rounded-full">
            X
          </div>
          <div className="text-base font-semibold text-red-700 dark:text-red-300">
            Invalid Image
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">
            {imageData.error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Toolbar */}
      <div className="flex justify-between items-center gap-2 flex-wrap w-full">
        <div className="flex gap-1 items-center">
          <IconButton variant="outline" size="sm" onClick={handleZoomOut} title="Zoom out">
            -
          </IconButton>
          <div className="min-w-[50px] text-center text-xs text-fg-muted">{zoom}%</div>
          <IconButton variant="outline" size="sm" onClick={handleZoomIn} title="Zoom in">
            +
          </IconButton>
          <Button variant="outline" size="sm" onClick={handleZoomReset} title="Reset zoom">
            Reset
          </Button>
        </div>
        <Button variant="solid" size="sm" onClick={handleDownload} title="Download image">
          Download
        </Button>
      </div>

      {/* Image container */}
      <div
        className={cx(
          "flex-1 flex items-center justify-center overflow-auto border border-border-default rounded-lg bg-bg-subtle min-h-[150px] p-2 w-full",
          // Checkerboard pattern for transparency
          "bg-[length:16px_16px]",
          "[background-image:linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)]",
          "[background-position:0_0,0_8px,8px_-8px,-8px_0px]",
          "dark:[background-image:linear-gradient(45deg,#374151_25%,transparent_25%),linear-gradient(-45deg,#374151_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#374151_75%),linear-gradient(-45deg,transparent_75%,#374151_75%)]"
        )}
      >
        <div style={{ transform: `scale(${zoom / 100})`, transition: "transform 0.2s ease", transformOrigin: "center center" }}>
          <img
            ref={imageRef}
            src={imageData.dataUri}
            alt="Preview"
            className="block max-w-full max-h-[400px] object-contain"
          />
        </div>
      </div>

      {/* Metadata */}
      <div className="flex gap-4 flex-wrap p-3 bg-bg-subtle rounded-lg border border-border-default w-full">
        <div className="flex flex-col gap-0.5 items-start">
          <div className="text-xs text-fg-muted uppercase tracking-wide">Type</div>
          <div className="text-sm font-medium font-mono">{getMimeTypeLabel(imageData.mimeType)}</div>
        </div>
        {imageData.width && imageData.height && (
          <div className="flex flex-col gap-0.5 items-start">
            <div className="text-xs text-fg-muted uppercase tracking-wide">Dimensions</div>
            <div className="text-sm font-medium font-mono">{imageData.width} x {imageData.height}</div>
          </div>
        )}
        <div className="flex flex-col gap-0.5 items-start">
          <div className="text-xs text-fg-muted uppercase tracking-wide">Size</div>
          <div className="text-sm font-medium font-mono">{formatBytes(imageData.size)}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ImagePreview />, document.getElementById("app")!);
