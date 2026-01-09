/**
 * Discover Use Cases Module
 *
 * Use cases for tool and capability discovery.
 *
 * @module application/use-cases/discover
 */

export { DiscoverToolsUseCase, type DiscoverToolsDeps, type DiscoverToolsRequest } from "./discover-tools.ts";
export { DiscoverCapabilitiesUseCase, type DiscoverCapabilitiesDeps, type DiscoverCapabilitiesRequest } from "./discover-capabilities.ts";
export type {
  DiscoverRequest,
  DiscoveredCapability,
  DiscoveredTool,
  DiscoverCapabilitiesResult,
  DiscoverToolsResult,
} from "./types.ts";
