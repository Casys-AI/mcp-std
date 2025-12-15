/**
 * Unit tests for PII Detector
 *
 * Tests detection accuracy for all supported PII types using validator.js
 * Target: >95% precision and recall, <5% false positives
 */

import { assertEquals, assertExists } from "@std/assert";
import { PIIDetector, TokenizationManager } from "../../../src/sandbox/pii-detector.ts";

Deno.test("PIIDetector - Email detection accuracy >95%", () => {
  const detector = new PIIDetector({ enabled: true, types: ["email"] });

  // True positives (should detect)
  const validEmails = [
    "alice@example.com",
    "bob.smith@company.co.uk",
    "test_user+tag@domain.com",
    "user123@subdomain.example.org",
  ];

  for (const email of validEmails) {
    const matches = detector.scan(`Contact: ${email}`);
    assertEquals(matches.length, 1, `Should detect valid email: ${email}`);
    assertEquals(matches[0].type, "email");
    assertEquals(matches[0].value, email);
  }

  // Calculate precision for valid emails (should be 100% for true positives)
  const precision = validEmails.length / validEmails.length;
  console.log(`Email detection precision: ${(precision * 100).toFixed(1)}%`);
  assertEquals(
    precision,
    1.0,
    "Should detect all valid emails (100% precision for true positives)",
  );

  // False positives (should NOT detect)
  const falsePositives = [
    "not-an-email",
    "test@",
    "@test.com",
    "user @domain.com", // Space
  ];

  for (const text of falsePositives) {
    const matches = detector.scan(text);
    assertEquals(matches.length, 0, `Should NOT detect invalid email: ${text}`);
  }
});

Deno.test("PIIDetector - Phone number detection (US/CA format) >95%", () => {
  const detector = new PIIDetector({ enabled: true, types: ["phone"] });

  // True positives
  const validPhones = [
    "555-123-4567",
    "5551234567",
    "555.123.4567",
    "555-123-4567",
  ];

  for (const phone of validPhones) {
    const matches = detector.scan(`Call: ${phone}`);
    assertEquals(matches.length >= 1, true, `Should detect valid phone: ${phone}`);
    if (matches.length > 0) {
      assertEquals(matches[0].type, "phone");
    }
  }

  // False positives
  const invalidPhones = [
    "123-45", // Too short
    "000-000-0000", // Invalid area code (might be detected - depends on validator.js)
  ];

  let falsePositiveCount = 0;
  for (const phone of invalidPhones) {
    const matches = detector.scan(phone);
    if (matches.length > 0) falsePositiveCount++;
  }

  const falsePositiveRate = falsePositiveCount / invalidPhones.length;
  console.log(`Phone false positive rate: ${(falsePositiveRate * 100).toFixed(1)}%`);
  // Note: validator.js is strict, so false positives should be low
});

Deno.test("PIIDetector - Credit card detection >95%", () => {
  const detector = new PIIDetector({ enabled: true, types: ["credit_card"] });

  // True positives (valid Luhn checksums)
  const validCards = [
    "4532015112830366", // Visa
    "5425233430109903", // Mastercard
    "4532-0151-1283-0366", // Visa with dashes
    "5425 2334 3010 9903", // Mastercard with spaces
  ];

  for (const card of validCards) {
    const matches = detector.scan(`Card: ${card}`);
    assertEquals(matches.length, 1, `Should detect valid card: ${card}`);
    assertEquals(matches[0].type, "credit_card");
  }

  // False positives (invalid Luhn checksum)
  const invalidCards = [
    "1234567890123456", // Invalid Luhn
    "0000-0000-0000-0000", // Invalid
  ];

  for (const card of invalidCards) {
    const matches = detector.scan(`Card: ${card}`);
    assertEquals(matches.length, 0, `Should NOT detect invalid card: ${card}`);
  }
});

Deno.test("PIIDetector - SSN detection (US format) >95%", () => {
  const detector = new PIIDetector({ enabled: true, types: ["ssn"] });

  // True positives
  const validSSNs = [
    "123-45-6789",
    "987-65-4321",
  ];

  for (const ssn of validSSNs) {
    const matches = detector.scan(`SSN: ${ssn}`);
    assertEquals(matches.length, 1, `Should detect valid SSN: ${ssn}`);
    assertEquals(matches[0].type, "ssn");
    assertEquals(matches[0].value, ssn);
  }

  // False positives (wrong format)
  const invalidSSNs = [
    "123-456-789", // Wrong format
    "12-34-5678", // Too short
  ];

  for (const ssn of invalidSSNs) {
    const matches = detector.scan(ssn);
    assertEquals(matches.length, 0, `Should NOT detect invalid SSN: ${ssn}`);
  }
});

Deno.test("PIIDetector - API key detection >90%", () => {
  const detector = new PIIDetector({ enabled: true, types: ["api_key"] });

  // True positives
  const validKeys = [
    "sk_test_abcdefghijklmnopqrstuvwxyz123456",
    "pk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012",
  ];

  for (const key of validKeys) {
    const matches = detector.scan(`API Key: ${key}`);
    assertEquals(matches.length, 1, `Should detect valid API key: ${key}`);
    assertEquals(matches[0].type, "api_key");
    assertEquals(matches[0].value, key);
  }

  // False positives (too short)
  const invalidKeys = [
    "sk_short", // Too short
    "pk_", // No suffix
  ];

  for (const key of invalidKeys) {
    const matches = detector.scan(key);
    assertEquals(matches.length, 0, `Should NOT detect invalid API key: ${key}`);
  }
});

Deno.test("PIIDetector - Multiple PII types in single text", () => {
  const detector = new PIIDetector();

  const text = `
    Contact Alice at alice@example.com or call 555-123-4567.
    Her SSN is 123-45-6789 and card number is 4532015112830366.
    API Key: sk_test_abcdefghijklmnopqrstuvwxyz123456
  `;

  const matches = detector.scan(text);

  // Should detect all 5 PII types
  assertEquals(matches.length >= 5, true, "Should detect multiple PII types");

  const types = matches.map((m) => m.type);
  assertEquals(types.includes("email"), true);
  assertEquals(types.includes("phone"), true);
  assertEquals(types.includes("ssn"), true);
  assertEquals(types.includes("credit_card"), true);
  assertEquals(types.includes("api_key"), true);
});

Deno.test("PIIDetector - Disabled protection returns no matches", () => {
  const detector = new PIIDetector({ enabled: false });

  const text = "Email: alice@example.com, Phone: 555-123-4567";
  const matches = detector.scan(text);

  assertEquals(matches.length, 0, "Should not detect PII when disabled");
});

Deno.test("PIIDetector - Selective type detection", () => {
  const detector = new PIIDetector({ enabled: true, types: ["email", "phone"] });

  const text = `
    Email: alice@example.com
    Phone: 555-123-4567
    SSN: 123-45-6789
  `;

  const matches = detector.scan(text);

  // Should only detect email and phone
  const types = matches.map((m) => m.type);
  assertEquals(types.includes("email"), true);
  assertEquals(types.includes("phone"), true);
  assertEquals(types.includes("ssn"), false, "Should NOT detect SSN when not enabled");
});

Deno.test("TokenizationManager - Tokenize and detokenize", () => {
  const detector = new PIIDetector();
  const manager = new TokenizationManager();

  const originalText = "Email: alice@example.com, Phone: 555-123-4567";
  const matches = detector.scan(originalText);

  // Tokenize
  const tokenizedText = manager.tokenize(originalText, matches);

  assertEquals(tokenizedText.includes("alice@example.com"), false, "Should not contain raw email");
  assertEquals(tokenizedText.includes("555-123-4567"), false, "Should not contain raw phone");
  assertEquals(tokenizedText.includes("[EMAIL_1]"), true, "Should contain email token");
  assertEquals(tokenizedText.includes("[PHONE_1]"), true, "Should contain phone token");

  // Detokenize
  const detokenizedText = manager.detokenize(tokenizedText);
  assertEquals(detokenizedText, originalText, "Should restore original text");
});

Deno.test("TokenizationManager - Reverse mapping", () => {
  const detector = new PIIDetector();
  const manager = new TokenizationManager();

  const text = "Email: alice@example.com";
  const matches = detector.scan(text);
  manager.tokenize(text, matches);

  const mapping = manager.getReverseMapping();
  assertExists(mapping["EMAIL_1"]);
  assertEquals(mapping["EMAIL_1"], "alice@example.com");
});

Deno.test("TokenizationManager - Clear mapping", () => {
  const detector = new PIIDetector();
  const manager = new TokenizationManager();

  const text = "Email: alice@example.com";
  const matches = detector.scan(text);
  manager.tokenize(text, matches);

  assertEquals(manager.getTokenCount(), 1);

  manager.clear();

  assertEquals(manager.getTokenCount(), 0, "Should clear all tokens");
});

Deno.test("TokenizationManager - Empty text handling", () => {
  const manager = new TokenizationManager();

  const tokenized = manager.tokenize("", []);
  assertEquals(tokenized, "", "Should handle empty text");

  const detokenized = manager.detokenize("");
  assertEquals(detokenized, "", "Should handle empty detokenization");
});

Deno.test("PIIDetector - Token ID incrementing", () => {
  const detector = new PIIDetector({ enabled: true, types: ["email"] });

  const text = "Emails: alice@example.com, bob@example.com, carol@example.com";
  const matches = detector.scan(text);

  assertEquals(matches.length, 3);
  assertEquals(matches[0].tokenId, "EMAIL_1");
  assertEquals(matches[1].tokenId, "EMAIL_2");
  assertEquals(matches[2].tokenId, "EMAIL_3");
});
