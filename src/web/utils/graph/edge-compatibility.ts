/**
 * Edge Compatibility Metrics for Force-Directed Edge Bundling (FDEB)
 * Based on Holten & van Wijk, 2009
 *
 * Four compatibility measures determine how strongly edges should bundle:
 * - Ca: Angle compatibility (parallel edges bundle better)
 * - Cs: Scale compatibility (similar length edges bundle better)
 * - Cp: Position compatibility (closer edges bundle better)
 * - Cv: Visibility compatibility (handles edge occlusion)
 */

export interface Point {
  x: number;
  y: number;
}

export interface Edge {
  source: Point;
  target: Point;
}

export interface CompatibilityResult {
  angle: number; // Ca ∈ [0,1]
  scale: number; // Cs ∈ [0,1]
  position: number; // Cp ∈ [0,1]
  visibility: number; // Cv ∈ [0,1]
  total: number; // Ce = Ca × Cs × Cp × Cv
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Calculate edge vector (target - source) */
function edgeVector(e: Edge): Point {
  return {
    x: e.target.x - e.source.x,
    y: e.target.y - e.source.y,
  };
}

/** Calculate edge length */
function edgeLength(e: Edge): number {
  const v = edgeVector(e);
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Calculate edge midpoint */
function edgeMidpoint(e: Edge): Point {
  return {
    x: (e.source.x + e.target.x) / 2,
    y: (e.source.y + e.target.y) / 2,
  };
}

/** Dot product of two vectors */
function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/** Distance between two points */
function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Project point onto line segment, return projection point */
function projectPointOntoEdge(point: Point, edge: Edge): Point {
  const v = edgeVector(edge);
  const len = edgeLength(edge);

  if (len === 0) return edge.source;

  // Vector from source to point
  const w = { x: point.x - edge.source.x, y: point.y - edge.source.y };

  // Projection scalar (clamped to [0,1] for segment)
  const t = Math.max(0, Math.min(1, dot(w, v) / (len * len)));

  return {
    x: edge.source.x + t * v.x,
    y: edge.source.y + t * v.y,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility Metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Angle Compatibility: Ca(P,Q) = |cos(α)|
 *
 * Parallel edges (α = 0° or 180°) → Ca = 1
 * Perpendicular edges (α = 90°) → Ca = 0
 *
 * We use absolute cosine to handle opposite directions as equivalent.
 */
export function angleCompatibility(p: Edge, q: Edge): number {
  const vp = edgeVector(p);
  const vq = edgeVector(q);

  const lenP = Math.sqrt(vp.x * vp.x + vp.y * vp.y);
  const lenQ = Math.sqrt(vq.x * vq.x + vq.y * vq.y);

  // Handle zero-length edges
  if (lenP === 0 || lenQ === 0) return 0;

  const cosAngle = dot(vp, vq) / (lenP * lenQ);

  // Clamp to [-1, 1] to handle floating point errors
  return Math.abs(Math.max(-1, Math.min(1, cosAngle)));
}

/**
 * Scale Compatibility: Cs(P,Q) = 2 / (lavg/lmin + lmax/lavg)
 *
 * Edges of similar length bundle better.
 * Equal length edges → Cs = 1
 * Very different lengths → Cs → 0
 */
export function scaleCompatibility(p: Edge, q: Edge): number {
  const lenP = edgeLength(p);
  const lenQ = edgeLength(q);

  // Handle zero-length edges
  if (lenP === 0 || lenQ === 0) return 0;

  const lavg = (lenP + lenQ) / 2;
  const lmin = Math.min(lenP, lenQ);
  const lmax = Math.max(lenP, lenQ);

  // Avoid division by zero
  if (lavg === 0 || lmin === 0) return 0;

  return 2 / (lavg / lmin + lmax / lavg);
}

/**
 * Position Compatibility: Cp(P,Q) = lavg / (lavg + ||Pm - Qm||)
 *
 * Edges with closer midpoints bundle better.
 * Same midpoint → Cp = 1
 * Far apart midpoints → Cp → 0
 */
export function positionCompatibility(p: Edge, q: Edge): number {
  const lenP = edgeLength(p);
  const lenQ = edgeLength(q);
  const lavg = (lenP + lenQ) / 2;

  // Handle zero-length edges
  if (lavg === 0) return 0;

  const midP = edgeMidpoint(p);
  const midQ = edgeMidpoint(q);
  const midDist = distance(midP, midQ);

  return lavg / (lavg + midDist);
}

/**
 * Visibility Compatibility: Cv(P,Q) = min(V(P,Q), V(Q,P))
 *
 * Handles the case where edges form a skewed parallelogram.
 * If one edge "sees" the other well (no occlusion), they can bundle.
 *
 * V(P,Q): visibility of Q from P
 *   - Project Q's endpoints onto line through P
 *   - Measure how centered P's midpoint is on the projection segment
 *   - If centered: V = 1, if outside: V = 0
 */
export function visibilityCompatibility(p: Edge, q: Edge): number {
  const vpq = visibility(p, q);
  const vqp = visibility(q, p);

  return Math.min(vpq, vqp);
}

/**
 * One-directional visibility: V(P,Q)
 *
 * Project Q onto the line through P, find intersection segment [I0, I1].
 * V = max(1 - 2||Pm - Im|| / ||I0 - I1||, 0)
 * where Im is the midpoint of the intersection segment.
 */
function visibility(p: Edge, q: Edge): number {
  // Project Q's endpoints onto line through P
  const i0 = projectPointOntoEdge(q.source, p);
  const i1 = projectPointOntoEdge(q.target, p);

  // Midpoint of projection segment
  const im = { x: (i0.x + i1.x) / 2, y: (i0.y + i1.y) / 2 };

  // Midpoint of P
  const pm = edgeMidpoint(p);

  // Distance from P's midpoint to projection midpoint
  const distPmIm = distance(pm, im);

  // Length of projection segment
  const projLen = distance(i0, i1);

  // Handle degenerate case (projection collapses to point)
  if (projLen === 0) return 0;

  // Visibility measure
  return Math.max(0, 1 - (2 * distPmIm) / projLen);
}

/**
 * Total Edge Compatibility: Ce(P,Q) = Ca × Cs × Cp × Cv
 *
 * Combines all four metrics multiplicatively.
 * High compatibility (Ce > 0.6) → strong bundling
 * Low compatibility (Ce < 0.05) → skip interaction (optimization)
 */
export function edgeCompatibility(p: Edge, q: Edge): CompatibilityResult {
  const angle = angleCompatibility(p, q);
  const scale = scaleCompatibility(p, q);
  const position = positionCompatibility(p, q);
  const vis = visibilityCompatibility(p, q);

  return {
    angle,
    scale,
    position,
    visibility: vis,
    total: angle * scale * position * vis,
  };
}

/**
 * Quick compatibility check (optimization)
 * Returns true if edges are compatible enough to consider for bundling.
 */
export function isCompatible(
  p: Edge,
  q: Edge,
  threshold: number = 0.05
): boolean {
  // Quick checks first (cheap to compute)
  const angle = angleCompatibility(p, q);
  if (angle < threshold) return false;

  const scale = scaleCompatibility(p, q);
  if (angle * scale < threshold) return false;

  const position = positionCompatibility(p, q);
  if (angle * scale * position < threshold) return false;

  // Full compatibility only if still above threshold
  const vis = visibilityCompatibility(p, q);
  return angle * scale * position * vis >= threshold;
}
