/**
 * Map Viewer UI for MCP Apps
 *
 * Simplified geographic data viewer with:
 * - SVG-based coordinate visualization
 * - Points with labels and colors
 * - Lines connecting points with distances
 * - Polygons with area calculation
 * - DMS/Decimal coordinate formatting
 * - Copy to clipboard functionality
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/map-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import * as Card from "../../components/ui/card";
import { Code } from "../../components/ui/code";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  id?: string;
}

interface GeoLine {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  label?: string;
  color?: string;
  distance?: number;
  unit?: string;
}

interface GeoPolygon {
  points: Array<{ lat: number; lng: number }>;
  label?: string;
  color?: string;
  fillOpacity?: number;
}

interface MapData {
  points?: GeoPoint[];
  lines?: GeoLine[];
  polygons?: GeoPolygon[];
  center?: { lat: number; lng: number };
  zoom?: number;
  title?: string;
  // Support direct geo_distance output format
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
  distance?: number;
  unit?: string;
  // Support geo_nearest output format
  reference?: { lat: number; lon: number };
  results?: Array<{ lat: number; lon: number; id?: string; distance?: number }>;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// Constants
// ============================================================================

const EARTH_RADIUS_KM = 6371;
const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Map Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Geo Helpers
// ============================================================================

const toRad = (deg: number): number => deg * (Math.PI / 180);

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { degrees: number; cardinal: string } {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const cardinal = cardinals[Math.round(bearing / 45) % 8];

  return { degrees: Math.round(bearing * 10) / 10, cardinal };
}

function formatCoordinate(
  value: number,
  type: "lat" | "lng",
  format: "decimal" | "dms"
): string {
  if (format === "decimal") {
    return `${value.toFixed(6)}`;
  }

  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minFloat);
  const seconds = Math.round((minFloat - minutes) * 60 * 10) / 10;

  let direction: string;
  if (type === "lat") {
    direction = value >= 0 ? "N" : "S";
  } else {
    direction = value >= 0 ? "E" : "W";
  }

  return `${degrees}deg${minutes}'${seconds}"${direction}`;
}

function formatDistance(km: number, targetUnit?: string): string {
  const unit = targetUnit || "km";
  switch (unit) {
    case "mi":
      return `${(km * 0.621371).toFixed(2)} mi`;
    case "m":
      return `${Math.round(km * 1000)} m`;
    case "nm":
      return `${(km * 0.539957).toFixed(2)} nm`;
    default:
      return `${km.toFixed(2)} km`;
  }
}

// ============================================================================
// Data Normalization
// ============================================================================

function normalizeMapData(raw: unknown): MapData {
  if (!raw || typeof raw !== "object") {
    return { points: [] };
  }

  const data = raw as Record<string, unknown>;

  // Handle geo_distance output: { from, to, distance, unit }
  if (data.from && data.to && typeof data.distance === "number") {
    const from = data.from as { lat: number; lon: number };
    const to = data.to as { lat: number; lon: number };
    return {
      points: [
        { lat: from.lat, lng: from.lon, label: "From", color: DEFAULT_COLORS[0] },
        { lat: to.lat, lng: to.lon, label: "To", color: DEFAULT_COLORS[1] },
      ],
      lines: [
        {
          from: { lat: from.lat, lng: from.lon },
          to: { lat: to.lat, lng: to.lon },
          distance: data.distance as number,
          unit: data.unit as string,
        },
      ],
    };
  }

  // Handle geo_nearest output: { reference, results }
  if (data.reference && Array.isArray(data.results)) {
    const ref = data.reference as { lat: number; lon: number };
    const results = data.results as Array<{
      lat: number;
      lon: number;
      id?: string;
      distance?: number;
    }>;

    const points: GeoPoint[] = [
      { lat: ref.lat, lng: ref.lon, label: "Reference", color: "#ef4444" },
    ];

    results.forEach((r, i) => {
      points.push({
        lat: r.lat,
        lng: r.lon,
        label: r.id || `#${i + 1} (${r.distance?.toFixed(2)} km)`,
        color: DEFAULT_COLORS[(i + 1) % DEFAULT_COLORS.length],
      });
    });

    return { points };
  }

  // Handle geo_bounds output
  if (data.bounds) {
    const bounds = data.bounds as {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    const center = data.center as { lat: number; lon: number } | undefined;

    return {
      polygons: [
        {
          points: [
            { lat: bounds.north, lng: bounds.west },
            { lat: bounds.north, lng: bounds.east },
            { lat: bounds.south, lng: bounds.east },
            { lat: bounds.south, lng: bounds.west },
          ],
          label: "Bounds",
          color: "#3b82f6",
          fillOpacity: 0.1,
        },
      ],
      center: center ? { lat: center.lat, lng: center.lon } : undefined,
    };
  }

  // Handle geo_point_in_polygon output
  if (data.point && data.polygonVertices !== undefined) {
    const point = data.point as { lat: number; lon: number };
    const inside = data.inside as boolean;

    return {
      points: [
        {
          lat: point.lat,
          lng: point.lon,
          label: inside ? "Inside" : "Outside",
          color: inside ? "#22c55e" : "#ef4444",
        },
      ],
    };
  }

  // Standard MapData format
  return data as MapData;
}

// ============================================================================
// SVG Map Component
// ============================================================================

interface SvgMapProps {
  points: GeoPoint[];
  lines: GeoLine[];
  polygons: GeoPolygon[];
  selectedPoint: GeoPoint | null;
  onSelectPoint: (point: GeoPoint | null) => void;
}

function SvgMap({
  points,
  lines,
  polygons,
  selectedPoint,
  onSelectPoint,
}: SvgMapProps) {
  // Calculate bounds
  const allLats: number[] = [];
  const allLngs: number[] = [];

  points.forEach((p) => {
    allLats.push(p.lat);
    allLngs.push(p.lng);
  });
  lines.forEach((l) => {
    allLats.push(l.from.lat, l.to.lat);
    allLngs.push(l.from.lng, l.to.lng);
  });
  polygons.forEach((poly) => {
    poly.points.forEach((p) => {
      allLats.push(p.lat);
      allLngs.push(p.lng);
    });
  });

  if (allLats.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-fg-muted">
        <span>No geographic data to display</span>
      </div>
    );
  }

  const minLat = Math.min(...allLats);
  const maxLat = Math.max(...allLats);
  const minLng = Math.min(...allLngs);
  const maxLng = Math.max(...allLngs);

  // Add padding
  const latPadding = Math.max((maxLat - minLat) * 0.15, 0.01);
  const lngPadding = Math.max((maxLng - minLng) * 0.15, 0.01);

  const viewMinLat = minLat - latPadding;
  const viewMaxLat = maxLat + latPadding;
  const viewMinLng = minLng - lngPadding;
  const viewMaxLng = maxLng + lngPadding;

  const width = 400;
  const height = 300;

  // Transform geo coords to SVG coords
  const toSvg = (lat: number, lng: number): { x: number; y: number } => {
    const x = ((lng - viewMinLng) / (viewMaxLng - viewMinLng)) * width;
    const y = ((viewMaxLat - lat) / (viewMaxLat - viewMinLat)) * height; // Flip Y
    return { x, y };
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto min-h-[200px]"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background grid */}
      <defs>
        <pattern
          id="grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="var(--colors-border-subtle)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Polygons */}
      {polygons.map((poly, i) => {
        const pathPoints = poly.points.map((p) => toSvg(p.lat, p.lng));
        const pathD =
          pathPoints.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

        return (
          <g key={`polygon-${i}`}>
            <path
              d={pathD}
              fill={poly.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              fillOpacity={poly.fillOpacity ?? 0.2}
              stroke={poly.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              strokeWidth="2"
            />
            {poly.label && (
              <text
                x={pathPoints.reduce((sum, p) => sum + p.x, 0) / pathPoints.length}
                y={pathPoints.reduce((sum, p) => sum + p.y, 0) / pathPoints.length}
                textAnchor="middle"
                fill="var(--colors-fg-default)"
                fontSize="10"
              >
                {poly.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Lines */}
      {lines.map((line, i) => {
        const from = toSvg(line.from.lat, line.from.lng);
        const to = toSvg(line.to.lat, line.to.lng);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dist =
          line.distance ??
          calculateDistance(line.from.lat, line.from.lng, line.to.lat, line.to.lng);

        return (
          <g key={`line-${i}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={line.color || "#6b7280"}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
            <rect
              x={midX - 30}
              y={midY - 10}
              width="60"
              height="18"
              rx="4"
              fill="var(--colors-bg-default)"
              stroke="var(--colors-border-default)"
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              fill="var(--colors-fg-default)"
              fontSize="10"
              fontFamily="monospace"
            >
              {formatDistance(dist, line.unit)}
            </text>
          </g>
        );
      })}

      {/* Points */}
      {points.map((point, i) => {
        const pos = toSvg(point.lat, point.lng);
        const isSelected = selectedPoint?.lat === point.lat && selectedPoint?.lng === point.lng;
        const color = point.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

        return (
          <g
            key={`point-${i}`}
            className="cursor-pointer transition-transform duration-150 hover:scale-110"
            onClick={() => onSelectPoint(isSelected ? null : point)}
          >
            {/* Pin shadow */}
            <ellipse
              cx={pos.x}
              cy={pos.y + 14}
              rx={isSelected ? 8 : 6}
              ry={isSelected ? 3 : 2}
              fill="rgba(0,0,0,0.2)"
            />
            {/* Pin marker */}
            <path
              d={`M ${pos.x} ${pos.y - 20}
                  C ${pos.x - 10} ${pos.y - 20}, ${pos.x - 10} ${pos.y - 8}, ${pos.x} ${pos.y}
                  C ${pos.x + 10} ${pos.y - 8}, ${pos.x + 10} ${pos.y - 20}, ${pos.x} ${pos.y - 20} Z`}
              fill={color}
              stroke={isSelected ? "var(--colors-fg-default)" : "white"}
              strokeWidth={isSelected ? 2 : 1}
            />
            {/* Inner circle */}
            <circle cx={pos.x} cy={pos.y - 14} r="4" fill="white" />
            {/* Label */}
            {point.label && (
              <g>
                <rect
                  x={pos.x - 40}
                  y={pos.y - 40}
                  width="80"
                  height="16"
                  rx="3"
                  fill="var(--colors-bg-default)"
                  stroke={color}
                  strokeWidth="1"
                />
                <text
                  x={pos.x}
                  y={pos.y - 28}
                  textAnchor="middle"
                  fill="var(--colors-fg-default)"
                  fontSize="10"
                  fontWeight="500"
                >
                  {point.label.length > 12
                    ? point.label.slice(0, 12) + "..."
                    : point.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Compass */}
      <g transform="translate(370, 30)">
        <circle cx="0" cy="0" r="18" fill="var(--colors-bg-default)" stroke="var(--colors-border-default)" />
        <text x="0" y="-6" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--colors-fg-default)">N</text>
        <path d="M 0 -12 L 3 0 L 0 -4 L -3 0 Z" fill="#ef4444" />
        <path d="M 0 12 L 3 0 L 0 4 L -3 0 Z" fill="var(--colors-fg-muted)" />
      </g>
    </svg>
  );
}

// ============================================================================
// Point Details Component
// ============================================================================

interface PointDetailsProps {
  point: GeoPoint;
  coordFormat: "decimal" | "dms";
  onCopy: (text: string) => void;
}

function PointDetails({ point, coordFormat, onCopy }: PointDetailsProps) {
  const latStr = formatCoordinate(point.lat, "lat", coordFormat);
  const lngStr = formatCoordinate(point.lng, "lng", coordFormat);
  const copyText =
    coordFormat === "decimal"
      ? `${point.lat}, ${point.lng}`
      : `${latStr}, ${lngStr}`;

  return (
    <Card.Root className="mb-3">
      <Card.Body className="p-3">
        <div className="flex gap-2 items-center mb-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: point.color || DEFAULT_COLORS[0] }}
          />
          <div className="font-semibold text-base">
            {point.label || "Point"}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 items-center">
            <div className="w-[30px] text-fg-muted text-xs font-medium">
              Lat:
            </div>
            <Code size="sm">{latStr}</Code>
          </div>
          <div className="flex gap-2 items-center">
            <div className="w-[30px] text-fg-muted text-xs font-medium">
              Lng:
            </div>
            <Code size="sm">{lngStr}</Code>
          </div>
        </div>
        <Button variant="outline" size="xs" onClick={() => onCopy(copyText)} className="mt-2">
          Copy Coordinates
        </Button>
      </Card.Body>
    </Card.Root>
  );
}

// ============================================================================
// Points List Component
// ============================================================================

interface PointsListProps {
  points: GeoPoint[];
  lines: GeoLine[];
  coordFormat: "decimal" | "dms";
  onSelectPoint: (point: GeoPoint) => void;
  onCopy: (text: string) => void;
}

function PointsList({
  points,
  lines,
  coordFormat,
  onSelectPoint,
  onCopy,
}: PointsListProps) {
  if (points.length === 0 && lines.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border-subtle pt-3">
      <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-2 m-0">
        Locations
      </h3>
      {points.map((point, i) => {
        const latStr = formatCoordinate(point.lat, "lat", coordFormat);
        const lngStr = formatCoordinate(point.lng, "lng", coordFormat);

        return (
          <div
            key={i}
            className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-bg-subtle"
            onClick={() => onSelectPoint(point)}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: point.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {point.label || `Point ${i + 1}`}
              </div>
              <Code size="sm" className="text-fg-muted">
                {latStr}, {lngStr}
              </Code>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(`${point.lat}, ${point.lng}`);
              }}
              title="Copy coordinates"
            >
              Copy
            </Button>
          </div>
        );
      })}

      {/* Distance summary for lines */}
      {lines.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 m-0">
            Distances
          </h4>
          {lines.map((line, i) => {
            const dist =
              line.distance ??
              calculateDistance(
                line.from.lat,
                line.from.lng,
                line.to.lat,
                line.to.lng
              );
            const bearing = calculateBearing(
              line.from.lat,
              line.from.lng,
              line.to.lat,
              line.to.lng
            );

            return (
              <div key={i} className="flex items-center gap-3 py-1">
                <div className="flex-1 text-sm text-fg-default">
                  {line.label || `Route ${i + 1}`}
                </div>
                <div className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {formatDistance(dist, line.unit)}
                </div>
                <div className="font-mono text-xs text-fg-muted">
                  {bearing.degrees}deg ({bearing.cardinal})
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MapViewer() {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<GeoPoint | null>(null);
  const [coordFormat, setCoordFormat] = useState<"decimal" | "dms">("decimal");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[map-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[map-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find(
          (c) => c.type === "text"
        ) as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(normalizeMapData(parsed));
        setSelectedPoint(null);
      } catch (e) {
        setError(
          `Failed to parse map data: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Extract points, lines, polygons
  const { points, lines, polygons } = useMemo(() => {
    if (!data) {
      return { points: [], lines: [], polygons: [] };
    }
    return {
      points: data.points || [],
      lines: data.lines || [],
      polygons: data.polygons || [],
    };
  }, [data]);

  // Copy handler
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback("Copied!");
      notifyModel("copy", { text });
      setTimeout(() => setCopyFeedback(null), 1500);
    });
  }, []);

  // Select point handler
  const handleSelectPoint = useCallback((point: GeoPoint | null) => {
    setSelectedPoint(point);
    if (point) {
      notifyModel("selectPoint", { point });
    }
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas p-4 min-h-[300px]">
        <div className="flex flex-col gap-2 items-center justify-center p-10">
          <Spinner size="md" />
          <div className="text-fg-muted">Loading map data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas p-4 min-h-[300px]">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!data || (points.length === 0 && lines.length === 0 && polygons.length === 0)) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas p-4 min-h-[300px]">
        <div className="p-10 text-center text-fg-muted">
          No geographic data to display
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm text-fg-default bg-bg-canvas p-4 min-h-[300px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-subtle">
        <h2 className="text-lg font-semibold m-0">
          {data.title || "Map Viewer"}
        </h2>
        <div className="flex gap-1">
          <Button
            variant={coordFormat === "decimal" ? "solid" : "outline"}
            size="xs"
            onClick={() => setCoordFormat("decimal")}
          >
            Decimal
          </Button>
          <Button
            variant={coordFormat === "dms" ? "solid" : "outline"}
            size="xs"
            onClick={() => setCoordFormat("dms")}
          >
            DMS
          </Button>
        </div>
      </div>

      {/* Copy feedback */}
      {copyFeedback && (
        <div className="fixed top-4 right-4 px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium z-[1000]">
          {copyFeedback}
        </div>
      )}

      {/* Map */}
      <div className="border border-border-default rounded-lg overflow-hidden bg-bg-subtle mb-3">
        <SvgMap
          points={points}
          lines={lines}
          polygons={polygons}
          selectedPoint={selectedPoint}
          onSelectPoint={handleSelectPoint}
        />
      </div>

      {/* Selected point details */}
      {selectedPoint && (
        <PointDetails
          point={selectedPoint}
          coordFormat={coordFormat}
          onCopy={handleCopy}
        />
      )}

      {/* Points list */}
      <PointsList
        points={points}
        lines={lines}
        coordFormat={coordFormat}
        onSelectPoint={handleSelectPoint}
        onCopy={handleCopy}
      />
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<MapViewer />, document.getElementById("app")!);
