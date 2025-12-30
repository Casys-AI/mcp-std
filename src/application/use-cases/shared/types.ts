/**
 * Shared Use Case Types
 *
 * Common types used across all use cases.
 *
 * @module application/use-cases/shared/types
 */

/**
 * Base result for all use cases
 */
export interface UseCaseResult<T> {
  success: boolean;
  data?: T;
  error?: UseCaseError;
}

/**
 * Use case error
 */
export interface UseCaseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
