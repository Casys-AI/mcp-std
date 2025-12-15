/**
 * Telemetry Type Definitions
 *
 * Defines interfaces and types for logging and telemetry system.
 *
 * @module telemetry/types
 */

/**
 * Log levels supported by the logging system
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Telemetry metric data
 */
export interface TelemetryMetric {
  metric_name: string;
  value: number;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  enabled: boolean;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  level?: LogLevel;
  logFilePath?: string;
  consoleOutput?: boolean;
  fileOutput?: boolean;
}
