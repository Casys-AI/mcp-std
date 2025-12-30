/**
 * MCP Client Registry Interface
 *
 * Defines the contract for MCP client management.
 * Implementations: MCPClientRegistry (to be created)
 *
 * Phase 2.1: Foundation for DI with diod
 *
 * @module domain/interfaces/mcp-client-registry
 */

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP client interface
 */
export interface IMCPClient {
  /** Server identifier */
  serverId: string;
  /** Server name (human-readable) */
  serverName: string;
  /** Whether the client is connected */
  isConnected(): boolean;
  /** Get available tools */
  getTools(): MCPToolDefinition[];
  /** Call a tool */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Connect to the server */
  connect(): Promise<void>;
  /** Disconnect from the server */
  disconnect(): Promise<void>;
}

/**
 * Client registration options
 */
export interface ClientRegistrationOptions {
  /** Override existing client with same ID */
  override?: boolean;
  /** Auto-connect after registration */
  autoConnect?: boolean;
}

/**
 * Interface for MCP client registry
 *
 * This interface abstracts the management of MCP server
 * connections, allowing for different connection strategies
 * and easy mocking in tests.
 */
export interface IMCPClientRegistry {
  /**
   * Get a client by server ID
   */
  getClient(serverId: string): IMCPClient | undefined;

  /**
   * Get all registered clients
   */
  getAllClients(): IMCPClient[];

  /**
   * Get all connected client IDs
   */
  getConnectedClientIds(): string[];

  /**
   * Register a new client
   */
  register(
    serverId: string,
    client: IMCPClient,
    options?: ClientRegistrationOptions,
  ): void;

  /**
   * Unregister a client
   */
  unregister(serverId: string): void;

  /**
   * Check if a client is registered
   */
  has(serverId: string): boolean;

  /**
   * Get total number of registered clients
   */
  size(): number;

  /**
   * Get all available tools across all clients
   */
  getAllTools(): MCPToolDefinition[];

  /**
   * Find which client provides a specific tool
   */
  findToolProvider(toolName: string): IMCPClient | undefined;

  /**
   * Call a tool on any connected client
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}
