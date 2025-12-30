/**
 * Dependency Injection Module
 *
 * Exports DI container, bootstrap utilities, and testing utilities.
 *
 * @module infrastructure/di
 */

// Container and tokens
export {
  buildContainer,
  getCapabilityRepository,
  getDAGExecutor,
  getGraphEngine,
  getMCPClientRegistry,
  getDbClient,
  getVectorSearch,
  getEventBus,
  // Abstract class tokens for DI registration
  CapabilityRepository,
  DAGExecutor,
  GraphEngine,
  MCPClientRegistry,
  DatabaseClient,
  VectorSearch,
  EventBus,
  Service,
  type AppConfig,
  type ContainerImplementations,
  type Container,
} from "./container.ts";

// Bootstrap for production
export {
  bootstrapDI,
  type BootstrappedServices,
  type BootstrapOptions,
} from "./bootstrap.ts";

// Adapters for wrapping existing implementations
export {
  GraphEngineAdapter,
  CapabilityRepositoryAdapter,
  MCPClientRegistryAdapter,
} from "./adapters/mod.ts";

// Testing utilities
export {
  buildTestContainer,
  createMockCapabilityRepo,
  createMockDAGExecutor,
  createMockGraphEngine,
  createMockMCPClientRegistry,
  type TestOverrides,
} from "./testing.ts";
