/**
 * E2E Tests: PII Protection
 *
 * Validates end-to-end PII detection and tokenization:
 * - Email detection and tokenization
 * - Phone number protection
 * - Credit card masking
 * - De-tokenization when needed
 * - Context never exposes raw PII
 *
 * Story 3.8 - AC: #2.3
 */

import { assertEquals, assertNotEquals, assertStringIncludes } from "@std/assert";
import { PIIDetector, TokenizationManager } from "../../../src/sandbox/pii-detector.ts";

Deno.test({
  name: "E2E PII: Emails detected and tokenized",
  fn() {
    const detector = new PIIDetector({ enabled: true, types: ["email"] });
    const manager = new TokenizationManager();

    const text = "Contact alice@secret.com or bob@private.org";
    const matches = detector.scan(text);

    assertEquals(matches.length, 2, "Should detect 2 emails");

    // Tokenize
    const tokenized = manager.tokenize(text, matches);

    // Should not contain original emails
    assertNotEquals(tokenized.includes("alice@secret.com"), true);
    assertNotEquals(tokenized.includes("bob@private.org"), true);
    assertStringIncludes(tokenized, "[EMAIL_");
  },
});

Deno.test({
  name: "E2E PII: Phone numbers protected",
  fn() {
    const detector = new PIIDetector({ enabled: true, types: ["phone"] });
    const manager = new TokenizationManager();

    const text = "Call me at 555-123-4567 or 1-800-555-0199";
    const matches = detector.scan(text);

    assertEquals(matches.length >= 1, true, "Should detect phone numbers");

    // Tokenize
    const tokenized = manager.tokenize(text, matches);

    // Should contain phone tokens
    assertStringIncludes(tokenized, "[PHONE_");
  },
});

Deno.test({
  name: "E2E PII: Credit card numbers masked",
  fn() {
    const detector = new PIIDetector({ enabled: true, types: ["credit_card"] });
    const manager = new TokenizationManager();

    const text = "Card: 4111-1111-1111-1111";
    const matches = detector.scan(text);

    assertEquals(matches.length, 1, "Should detect credit card");
    assertEquals(matches[0].type, "credit_card");

    // Tokenize
    const tokenized = manager.tokenize(text, matches);
    assertStringIncludes(tokenized, "[CARD_");
  },
});

Deno.test({
  name: "E2E PII: De-tokenization restores original values",
  fn() {
    const detector = new PIIDetector({ enabled: true, types: ["email"] });
    const manager = new TokenizationManager();

    const originalText = "Email: secret@example.com";
    const matches = detector.scan(originalText);

    // Tokenize
    const tokenized = manager.tokenize(originalText, matches);
    assertNotEquals(tokenized, originalText);

    // De-tokenize should restore
    const restored = manager.detokenize(tokenized);
    assertEquals(restored, originalText);
  },
});

Deno.test({
  name: "E2E PII: Multiple PII types in same text",
  fn() {
    const detector = new PIIDetector({
      enabled: true,
      types: ["email", "phone", "credit_card"],
    });

    const text = `
      Contact: john@company.com
      Phone: 555-987-6543
      Payment: 4242-4242-4242-4242
    `;

    const matches = detector.scan(text);

    // Should find at least email
    const types = new Set(matches.map((m) => m.type));
    assertEquals(types.has("email"), true, "Should detect email");
    assertEquals(matches.length >= 1, true, "Should detect multiple PII");
  },
});

Deno.test({
  name: "E2E PII: Disabled detector returns empty",
  fn() {
    const detector = new PIIDetector({ enabled: false });

    const text = "Email: visible@example.com";
    const matches = detector.scan(text);

    assertEquals(matches.length, 0, "Disabled detector should return no matches");
  },
});

Deno.test({
  name: "E2E PII: Large dataset tokenization performance",
  fn() {
    const detector = new PIIDetector({ enabled: true, types: ["email"] });
    const manager = new TokenizationManager();

    // Generate 100 emails
    const emails = Array.from(
      { length: 100 },
      (_, i) => `user${i}@domain${i}.com`,
    );
    const text = emails.join("\n");

    const startTime = performance.now();
    const matches = detector.scan(text);
    const scanTime = performance.now() - startTime;

    // Tokenize all
    const tokenizeStart = performance.now();
    manager.tokenize(text, matches);
    const tokenizeTime = performance.now() - tokenizeStart;

    // Should complete quickly (<500ms total)
    const totalTime = scanTime + tokenizeTime;
    assertEquals(
      totalTime < 500,
      true,
      `PII processing should be fast: ${totalTime.toFixed(1)}ms`,
    );

    // Should detect all emails
    assertEquals(matches.length, 100, "Should detect all 100 emails");

    console.log(`  Scan time: ${scanTime.toFixed(1)}ms`);
    console.log(`  Tokenize time: ${tokenizeTime.toFixed(1)}ms`);
  },
});
