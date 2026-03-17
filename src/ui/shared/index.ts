/**
 * Shared UI utilities for MCP Apps
 *
 * Provides consistent styling patterns, components, and interactions
 * across all 40+ UI components in lib/std.
 *
 * @module lib/std/src/ui/shared
 */

// Micro-interactions and style utilities
export {
  interactive,
  statusStyles,
  valueTransition,
  typography,
  containers,
} from "./interactions";

// Enhanced components
export { StatusBadge, StatusIcons, type StatusBadgeProps, type StatusVariant } from "./StatusBadge";

// Loading skeletons
export {
  TableSkeleton,
  ChartSkeleton,
  MetricsSkeleton,
  GaugeSkeleton,
  TreeSkeleton,
  ContentSkeleton,
  Skeleton,
  SkeletonText,
} from "./LoadingSkeleton";

// Re-export utilities from components
export { cx, formatValue, formatNumber, formatPercent, clamp } from "../components/utils";
