/**
 * WorkflowState Management with MessagesState-inspired Reducers
 *
 * Implements state management for adaptive DAG feedback loops using
 * pure reducer functions inspired by LangGraph's MessagesState pattern.
 *
 * @module dag/state
 */

/**
 * Message type for multi-turn conversation tracking
 */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Decision type for AIL/HIL decision tracking
 */
export interface Decision {
  type: "AIL" | "HIL"; // Agent-in-Loop | Human-in-Loop
  timestamp: number;
  description: string;
  outcome: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Task result for completed tasks tracking (re-export from types.ts)
 *
 * Status values (Story 3.5):
 * - "success": Task completed successfully
 * - "error": Critical failure, halts workflow
 * - "failed_safe": Safe-to-fail task failed, workflow continues
 */
export interface TaskResult {
  taskId: string;
  status: "success" | "error" | "failed_safe";
  output?: unknown;
  error?: string;
  executionTimeMs?: number;
}

/**
 * WorkflowState interface with 4 reducer-managed fields
 *
 * - messages: Multi-turn conversation history (reducer: append)
 * - tasks: Completed task results (reducer: append)
 * - decisions: AIL/HIL decisions made (reducer: append)
 * - context: Shared execution context (reducer: merge)
 */
export interface WorkflowState {
  workflowId: string;
  currentLayer: number;
  messages: Message[];
  tasks: TaskResult[];
  decisions: Decision[];
  context: Record<string, unknown>;
}

/**
 * State update type for partial updates
 */
export type StateUpdate =
  & Partial<
    Omit<WorkflowState, "workflowId" | "currentLayer">
  >
  & {
    workflowId?: never; // Prevent workflowId changes
    currentLayer?: number; // Allow layer updates
  };

/**
 * Messages reducer: Appends new messages to existing array
 *
 * Pure function that creates a new array with existing + new messages.
 * Inspired by LangGraph's MessagesState reducer pattern.
 *
 * @param existing - Current messages array
 * @param update - New messages to append
 * @returns New messages array (existing + update)
 */
export function messagesReducer(
  existing: Message[],
  update: Message[],
): Message[] {
  return [...existing, ...update];
}

/**
 * Tasks reducer: Appends new task results to existing array
 *
 * @param existing - Current tasks array
 * @param update - New task results to append
 * @returns New tasks array (existing + update)
 */
export function tasksReducer(
  existing: TaskResult[],
  update: TaskResult[],
): TaskResult[] {
  return [...existing, ...update];
}

/**
 * Decisions reducer: Appends new decisions to existing array
 *
 * @param existing - Current decisions array
 * @param update - New decisions to append
 * @returns New decisions array (existing + update)
 */
export function decisionsReducer(
  existing: Decision[],
  update: Decision[],
): Decision[] {
  return [...existing, ...update];
}

/**
 * Context reducer: Merges new context into existing context
 *
 * Performs shallow merge, where new values override existing keys.
 * For deep merging, values should be pre-merged before calling reducer.
 *
 * @param existing - Current context object
 * @param update - New context to merge
 * @returns New context object (shallow merge)
 */
export function contextReducer(
  existing: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...update };
}

/**
 * Validate state invariants
 *
 * Ensures:
 * - tasks.length >= decisions.length (decisions follow tasks)
 * - current_layer >= 0
 * - workflow_id is non-empty
 *
 * @param state - State to validate
 * @throws Error if invariants violated
 */
export function validateStateInvariants(state: WorkflowState): void {
  if (!state.workflowId || state.workflowId.trim() === "") {
    throw new Error("State invariant violated: workflow_id must be non-empty");
  }

  if (state.currentLayer < 0) {
    throw new Error(
      `State invariant violated: current_layer must be >= 0 (got ${state.currentLayer})`,
    );
  }

  if (state.tasks.length < state.decisions.length) {
    throw new Error(
      `State invariant violated: tasks.length (${state.tasks.length}) must be >= decisions.length (${state.decisions.length})`,
    );
  }
}

/**
 * Update workflow state using reducers
 *
 * Applies reducers automatically based on field:
 * - messages → messagesReducer (append)
 * - tasks → tasksReducer (append)
 * - decisions → decisionsReducer (append)
 * - context → contextReducer (merge)
 * - current_layer → direct update
 *
 * Validates invariants after update.
 * Uses shallow copying for performance (<1ms target).
 *
 * @param state - Current state
 * @param update - Partial state update
 * @returns New state with updates applied
 * @throws Error if invariants violated
 */
export function updateState(
  state: WorkflowState,
  update: StateUpdate,
): WorkflowState {
  const newState: WorkflowState = {
    workflowId: state.workflowId, // Immutable
    currentLayer: update.currentLayer ?? state.currentLayer,
    messages: update.messages ? messagesReducer(state.messages, update.messages) : state.messages,
    tasks: update.tasks ? tasksReducer(state.tasks, update.tasks) : state.tasks,
    decisions: update.decisions
      ? decisionsReducer(state.decisions, update.decisions)
      : state.decisions,
    context: update.context ? contextReducer(state.context, update.context) : state.context,
  };

  // Validate invariants
  validateStateInvariants(newState);

  return newState;
}

/**
 * Create initial workflow state
 *
 * @param workflow_id - Unique workflow identifier
 * @returns Initial state with empty arrays and context
 */
export function createInitialState(workflowId: string): WorkflowState {
  const state: WorkflowState = {
    workflowId,
    currentLayer: 0,
    messages: [],
    tasks: [],
    decisions: [],
    context: {},
  };

  validateStateInvariants(state);
  return state;
}

/**
 * Get readonly snapshot of state
 *
 * Returns a readonly view to prevent accidental mutations.
 * Use updateState() for modifications.
 *
 * @param state - State to snapshot
 * @returns Readonly state
 */
export function getStateSnapshot(state: WorkflowState): Readonly<WorkflowState> {
  return Object.freeze({ ...state });
}
