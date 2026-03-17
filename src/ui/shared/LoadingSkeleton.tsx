/**
 * LoadingSkeleton - Pre-configured skeleton loading states
 *
 * Provides common loading patterns for MCP Apps UIs
 * using Preact + Tailwind CSS.
 *
 * @module lib/std/src/ui/shared/LoadingSkeleton
 */

import { Skeleton, SkeletonText } from "../components/ui/skeleton";
import { containers } from "./interactions";
import { cx } from "../components/utils";

/**
 * Table loading skeleton
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className={containers.root}>
      {/* Header */}
      <div className="flex gap-3 mb-3 items-center">
        <Skeleton height="36px" width="200px" className="rounded-md" />
        <Skeleton height="36px" width="100px" className="rounded-md" />
      </div>

      {/* Table header */}
      <div className="flex gap-4 mb-2 p-2">
        <Skeleton height="16px" width="80px" />
        <Skeleton height="16px" width="120px" />
        <Skeleton height="16px" width="100px" />
        <Skeleton height="16px" width="80px" />
      </div>

      {/* Table rows */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 p-2 w-full">
            <Skeleton height="20px" width="80px" />
            <Skeleton height="20px" width="120px" />
            <Skeleton height="20px" width="100px" />
            <Skeleton height="20px" width="80px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Chart loading skeleton
 */
export function ChartSkeleton() {
  return (
    <div className={containers.root}>
      {/* Header */}
      <div className="flex justify-between mb-4">
        <Skeleton height="24px" width="150px" />
        <div className="flex gap-1">
          <Skeleton height="32px" width="60px" className="rounded-md" />
          <Skeleton height="32px" width="60px" className="rounded-md" />
          <Skeleton height="32px" width="60px" className="rounded-md" />
        </div>
      </div>

      {/* Chart area */}
      <Skeleton height="250px" width="100%" className="rounded-lg" />

      {/* Legend */}
      <div className="flex gap-4 mt-3 justify-center">
        <div className="flex gap-1.5 items-center">
          <Skeleton height="12px" width="12px" className="rounded-sm" />
          <Skeleton height="12px" width="60px" />
        </div>
        <div className="flex gap-1.5 items-center">
          <Skeleton height="12px" width="12px" className="rounded-sm" />
          <Skeleton height="12px" width="60px" />
        </div>
      </div>
    </div>
  );
}

/**
 * Metrics panel loading skeleton
 */
export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={containers.root}>
      <div className="flex gap-4 flex-wrap">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 flex-1 min-w-[150px]">
            <Skeleton height="14px" width="80px" className="mb-2" />
            <Skeleton height="32px" width="100px" className="mb-1" />
            <Skeleton height="12px" width="60px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Gauge loading skeleton
 */
export function GaugeSkeleton({ variant = "circular" }: { variant?: "circular" | "linear" }) {
  if (variant === "linear") {
    return (
      <div className={cx(containers.root, "w-[200px]")}>
        <div className="flex justify-between mb-1">
          <Skeleton height="14px" width="60px" />
          <Skeleton height="20px" width="50px" />
        </div>
        <Skeleton height="8px" width="100%" className="rounded-full" />
        <div className="flex justify-between mt-1">
          <Skeleton height="12px" width="20px" />
          <Skeleton height="12px" width="20px" />
        </div>
      </div>
    );
  }

  return (
    <div className={cx(containers.root, "inline-flex")}>
      <div className="flex flex-col gap-0 items-center">
        <Skeleton height="120px" width="120px" className="rounded-full" />
        <Skeleton height="14px" width="60px" className="mt-1" />
      </div>
    </div>
  );
}

/**
 * JSON/Tree viewer loading skeleton
 */
export function TreeSkeleton({ depth = 3 }: { depth?: number }) {
  return (
    <div className={containers.root}>
      <div className="flex flex-col gap-2 items-start">
        <Skeleton height="16px" width="100px" />
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1 items-start" style={{ paddingLeft: `${(i + 1) * 16}px` }}>
            <Skeleton height="14px" width={`${150 - i * 20}px`} />
            <Skeleton height="14px" width={`${120 - i * 15}px`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Generic content loading skeleton with text
 */
export function ContentSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={containers.root}>
      <Skeleton height="20px" width="60%" className="mb-3" />
      <SkeletonText lines={lines} gap="8px" />
    </div>
  );
}

// Re-export base components for custom usage
export { Skeleton, SkeletonText };
