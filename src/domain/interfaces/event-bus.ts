/**
 * Event Bus Interface
 *
 * Domain interface for event publishing and subscription.
 *
 * @module domain/interfaces/event-bus
 */

import type { EventType, PmlEvent } from "../../events/types.ts";

/**
 * Event handler function signature
 */
export type EventHandler<T extends EventType = EventType> = (
  event: PmlEvent<T>,
) => void | Promise<void>;

/**
 * Wildcard event handler
 */
export type WildcardEventHandler = (event: PmlEvent) => void | Promise<void>;

/**
 * Event Bus interface for domain events
 */
export interface IEventBus {
  /**
   * Emit an event
   */
  emit<T extends EventType>(
    event: Omit<PmlEvent<T>, "timestamp"> & { timestamp?: number },
  ): void;

  /**
   * Subscribe to an event type
   * @returns Unsubscribe function
   */
  on<T extends EventType>(type: T, handler: EventHandler<T>): () => void;

  /**
   * Subscribe to an event once
   * @returns Unsubscribe function
   */
  once<T extends EventType>(type: T, handler: EventHandler<T>): () => void;

  /**
   * Unsubscribe from an event
   */
  off(type: EventType | "*", handler: EventHandler | WildcardEventHandler): void;

  /**
   * Check if event type has handlers
   */
  hasHandlers(type: EventType | "*"): boolean;
}
