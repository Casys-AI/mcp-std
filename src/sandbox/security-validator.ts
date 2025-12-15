/**
 * Security Validator - Input Validation & Sanitization
 *
 * Provides comprehensive security validation for sandbox code execution:
 * - Malicious pattern detection (eval, Function, prototype pollution)
 * - Context object sanitization
 * - Code complexity analysis
 * - Security error reporting
 *
 * This module implements Story 3.9 AC #2 (Input Validation)
 *
 * @module sandbox/security-validator
 */

import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Security error class for validation failures
 */
export class SecurityValidationError extends Error {
  readonly pattern: string;
  readonly violationType: string;
  readonly timestamp: number;

  constructor(violationType: string, pattern: string, details?: string) {
    super(
      `Security violation detected: ${violationType} - ${pattern}${details ? ` (${details})` : ""}`,
    );
    this.name = "SecurityValidationError";
    this.violationType = violationType;
    this.pattern = pattern;
    this.timestamp = Date.now();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SecurityValidationError.prototype);
  }

  toJSON() {
    return {
      type: this.name,
      violationType: this.violationType,
      pattern: this.pattern,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Dangerous code patterns that should be rejected
 */
const DANGEROUS_PATTERNS = [
  // Direct eval usage (most dangerous)
  {
    regex: /\beval\s*\(/,
    type: "EVAL_USAGE",
    description: "Direct eval() call detected",
    severity: "CRITICAL",
  },

  // Function constructor (code injection)
  {
    regex: /\bFunction\s*\(/,
    type: "FUNCTION_CONSTRUCTOR",
    description: "Function() constructor detected",
    severity: "CRITICAL",
  },

  // Prototype pollution attempts
  {
    regex: /__proto__/,
    type: "PROTO_POLLUTION",
    description: "__proto__ property access detected",
    severity: "HIGH",
  },
  {
    regex: /constructor\s*\[\s*["']prototype["']\s*\]/,
    type: "CONSTRUCTOR_PROTOTYPE",
    description: "constructor.prototype manipulation detected",
    severity: "HIGH",
  },
  {
    regex: /__defineGetter__/,
    type: "DEFINE_GETTER",
    description: "__defineGetter__ usage detected",
    severity: "HIGH",
  },
  {
    regex: /__defineSetter__/,
    type: "DEFINE_SETTER",
    description: "__defineSetter__ usage detected",
    severity: "HIGH",
  },
  {
    regex: /__lookupGetter__/,
    type: "LOOKUP_GETTER",
    description: "__lookupGetter__ usage detected",
    severity: "MEDIUM",
  },
  {
    regex: /__lookupSetter__/,
    type: "LOOKUP_SETTER",
    description: "__lookupSetter__ usage detected",
    severity: "MEDIUM",
  },

  // Import/dynamic import (should use MCP tools instead)
  {
    regex: /\bimport\s*\(/,
    type: "DYNAMIC_IMPORT",
    description: "Dynamic import() detected - use MCP tools instead",
    severity: "MEDIUM",
  },
] as const;

/**
 * Dangerous context object keys that could cause prototype pollution
 */
const DANGEROUS_CONTEXT_KEYS = [
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
] as const;

/**
 * Security Validator Configuration
 */
export interface SecurityValidatorConfig {
  /**
   * Whether to enable code pattern validation
   * @default true
   */
  enableCodeValidation?: boolean;

  /**
   * Whether to enable context sanitization
   * @default true
   */
  enableContextSanitization?: boolean;

  /**
   * Maximum allowed code length (prevents abuse)
   * @default 100000 (100KB)
   */
  maxCodeLength?: number;

  /**
   * Custom dangerous patterns to check (in addition to defaults)
   */
  customPatterns?: Array<{
    regex: RegExp;
    type: string;
    description: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  }>;
}

/**
 * Security Validator
 *
 * Validates code and context objects before sandbox execution to prevent:
 * - Code injection attacks (eval, Function)
 * - Prototype pollution
 * - Malicious patterns
 */
export class SecurityValidator {
  private config:
    & Required<
      Omit<SecurityValidatorConfig, "customPatterns">
    >
    & { customPatterns: SecurityValidatorConfig["customPatterns"] };

  constructor(config?: SecurityValidatorConfig) {
    this.config = {
      enableCodeValidation: config?.enableCodeValidation ?? true,
      enableContextSanitization: config?.enableContextSanitization ?? true,
      maxCodeLength: config?.maxCodeLength ?? 100000, // 100KB
      customPatterns: config?.customPatterns,
    };

    logger.debug("SecurityValidator initialized", {
      codeValidation: this.config.enableCodeValidation,
      contextSanitization: this.config.enableContextSanitization,
      maxCodeLength: this.config.maxCodeLength,
      customPatternsCount: this.config.customPatterns?.length ?? 0,
    });
  }

  /**
   * Validate code input before execution
   *
   * Checks for:
   * - Dangerous patterns (eval, Function, prototype pollution)
   * - Code length limits
   * - Custom security patterns
   *
   * @param code - User code to validate
   * @throws SecurityValidationError if validation fails
   */
  validateCode(code: string): void {
    if (!this.config.enableCodeValidation) {
      return;
    }

    // Check code length
    if (code.length > this.config.maxCodeLength) {
      logger.warn("Code exceeds maximum length", {
        codeLength: code.length,
        maxLength: this.config.maxCodeLength,
      });
      throw new SecurityValidationError(
        "CODE_TOO_LONG",
        `Code length ${code.length} exceeds maximum ${this.config.maxCodeLength}`,
        "Reduce code size or increase maxCodeLength",
      );
    }

    // Check for dangerous patterns
    const allPatterns = [
      ...DANGEROUS_PATTERNS,
      ...(this.config.customPatterns || []),
    ];

    for (const pattern of allPatterns) {
      if (pattern.regex.test(code)) {
        logger.warn("Dangerous pattern detected in code", {
          type: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
        });

        throw new SecurityValidationError(
          pattern.type,
          pattern.description,
          `Severity: ${pattern.severity}`,
        );
      }
    }

    logger.debug("Code validation passed", {
      codeLength: code.length,
      patternsChecked: allPatterns.length,
    });
  }

  /**
   * Validate and sanitize context object
   *
   * Checks for:
   * - Dangerous property names (__proto__, constructor, etc.)
   * - Prototype pollution attempts
   * - Invalid variable names
   *
   * @param context - Context object to validate
   * @throws SecurityValidationError if validation fails
   * @returns Sanitized context (same object if no changes needed)
   */
  validateContext(
    context: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!context || !this.config.enableContextSanitization) {
      return context;
    }

    // Check for dangerous keys
    for (const key of Object.keys(context)) {
      // Check for dangerous property names (case-insensitive)
      const lowerKey = key.toLowerCase();
      for (const dangerous of DANGEROUS_CONTEXT_KEYS) {
        if (lowerKey.includes(dangerous.toLowerCase())) {
          logger.warn("Dangerous context key detected", {
            key,
            dangerous,
          });

          throw new SecurityValidationError(
            "DANGEROUS_CONTEXT_KEY",
            `Context contains dangerous key: ${key}`,
            `Remove key or rename to avoid ${dangerous}`,
          );
        }
      }

      // Validate variable name is safe (alphanumeric + underscore only)
      // This prevents injection via context keys
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        logger.warn("Invalid context variable name", { key });

        throw new SecurityValidationError(
          "INVALID_CONTEXT_KEY",
          `Invalid context variable name: ${key}`,
          "Variable names must be alphanumeric with underscores only",
        );
      }
    }

    // Deep validation: Check for dangerous values in nested objects
    this.validateContextValues(context);

    logger.debug("Context validation passed", {
      keyCount: Object.keys(context).length,
    });

    return context;
  }

  /**
   * Recursively validate context values (prevent nested pollution)
   *
   * @param obj - Object to validate
   * @param depth - Current recursion depth (prevents infinite recursion)
   * @throws SecurityValidationError if dangerous values found
   */
  private validateContextValues(
    obj: Record<string, unknown>,
    depth = 0,
  ): void {
    // Prevent infinite recursion
    if (depth > 10) {
      logger.warn("Context validation depth limit reached", { depth });
      throw new SecurityValidationError(
        "CONTEXT_TOO_DEEP",
        "Context object nesting exceeds maximum depth of 10",
        "Flatten context structure",
      );
    }

    for (const [key, value] of Object.entries(obj)) {
      // Check if value is an object (potential nested pollution)
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        // Recursively validate nested objects
        this.validateContextValues(value as Record<string, unknown>, depth + 1);
      }

      // Check for attempts to pass functions (should be serialized as null)
      if (typeof value === "function") {
        logger.warn("Context contains function value", { key });
        throw new SecurityValidationError(
          "FUNCTION_IN_CONTEXT",
          `Context key '${key}' contains function value`,
          "Context must be JSON-serializable (no functions)",
        );
      }
    }
  }

  /**
   * Validate both code and context in a single call
   *
   * Convenience method that validates both inputs.
   *
   * @param code - User code to validate
   * @param context - Context object to validate
   * @throws SecurityValidationError if validation fails
   * @returns Sanitized context
   */
  validate(
    code: string,
    context?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    // Validate code first (fail fast on code issues)
    this.validateCode(code);

    // Validate context
    return this.validateContext(context);
  }

  /**
   * Check if a specific pattern is present in code (for testing/analysis)
   *
   * @param code - Code to check
   * @param patternType - Pattern type to check for
   * @returns True if pattern is found
   */
  hasPattern(code: string, patternType: string): boolean {
    const pattern = DANGEROUS_PATTERNS.find((p) => p.type === patternType);
    return pattern ? pattern.regex.test(code) : false;
  }

  /**
   * Get list of all dangerous patterns
   *
   * @returns Array of pattern definitions
   */
  static getDangerousPatterns() {
    return [...DANGEROUS_PATTERNS];
  }

  /**
   * Get list of dangerous context keys
   *
   * @returns Array of dangerous key names
   */
  static getDangerousContextKeys() {
    return [...DANGEROUS_CONTEXT_KEYS];
  }
}
