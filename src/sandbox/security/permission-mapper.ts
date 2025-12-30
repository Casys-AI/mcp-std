/**
 * Permission Mapper
 *
 * Maps permission sets to Deno permission flags.
 * Story 7.7b: Permission set support (ADR-035)
 *
 * @module sandbox/security/permission-mapper
 */

import type { PermissionSet } from "../../capabilities/types.ts";
import { getLogger } from "../../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Permission profiles mapping permission sets to Deno flags
 */
const PERMISSION_PROFILES: Record<PermissionSet, string[]> = {
  "minimal": [], // Deny all (most restrictive)
  "readonly": ["--allow-read=./data,/tmp"],
  "filesystem": ["--allow-read", "--allow-write=/tmp"],
  "network-api": ["--allow-net"],
  "mcp-standard": [
    "--allow-read",
    "--allow-write=/tmp,./output",
    "--allow-net",
    "--allow-env=HOME,PATH",
  ],
  "trusted": ["--allow-all"],
};

/**
 * Permission Mapper
 *
 * Handles mapping between permission sets and Deno permission flags.
 */
export class PermissionMapper {
  private permissionSetSupportCached?: boolean;

  /**
   * Check if current Deno version supports permission sets (>= 2.5)
   * Story 7.7b (AC#3): Version detection for permission set support
   *
   * @returns true if Deno version >= 2.5, false otherwise
   */
  supportsPermissionSets(): boolean {
    if (this.permissionSetSupportCached !== undefined) {
      return this.permissionSetSupportCached;
    }

    try {
      const [major, minor] = Deno.version.deno.split(".").map(Number);
      this.permissionSetSupportCached = major > 2 || (major === 2 && minor >= 5);

      logger.debug("Deno version permission set support detected", {
        version: Deno.version.deno,
        supportsPermissionSets: this.permissionSetSupportCached,
      });

      return this.permissionSetSupportCached;
    } catch {
      this.permissionSetSupportCached = false;
      return false;
    }
  }

  /**
   * Map permission set to explicit Deno flags (fallback for Deno < 2.5)
   * Story 7.7b (AC#4): Permission set to flags mapping
   *
   * @param set - Permission set to map
   * @returns Array of Deno permission flags
   */
  toDenoFlags(set: PermissionSet): string[] {
    const flags = PERMISSION_PROFILES[set];
    if (flags === undefined) {
      logger.warn("Unknown permission set, using minimal", { requestedSet: set });
      return [];
    }
    return [...flags]; // Return copy to prevent mutation
  }

  /**
   * Get profile for a permission set
   *
   * @param set - Permission set name
   * @returns Permission flags or undefined if not found
   */
  getProfile(set: PermissionSet): string[] | undefined {
    return PERMISSION_PROFILES[set] ? [...PERMISSION_PROFILES[set]] : undefined;
  }

  /**
   * Check if a permission set includes read access
   *
   * @param flags - Permission flags to check
   * @returns true if read access is granted
   */
  hasReadPermission(flags: string[]): boolean {
    return flags.some((f) =>
      f.startsWith("--allow-read") || f === "--allow-all"
    );
  }

  /**
   * Add path to read permissions
   *
   * @param flags - Current permission flags
   * @param path - Path to add
   * @returns Updated flags array
   */
  addReadPath(flags: string[], path: string): string[] {
    const result = [...flags];
    const readFlagIndex = result.findIndex((f) => f.startsWith("--allow-read="));

    if (readFlagIndex !== -1) {
      result[readFlagIndex] = `${result[readFlagIndex]},${path}`;
    } else if (!result.includes("--allow-read") && !result.includes("--allow-all")) {
      result.push(`--allow-read=${path}`);
    }

    return result;
  }
}

/**
 * Singleton instance for convenience
 */
export const permissionMapper = new PermissionMapper();
