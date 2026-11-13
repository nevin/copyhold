import assert from "node:assert/strict";
import test from "node:test";
import { detectSensitive, sensitiveLabel } from "../src/lib/sensitive.js";

test("common secrets are recognized", () => {
  const cases = {
    // Made-up keys, assembled at runtime so secret scanners don't mistake them for real ones.
    [["sk", "live", "51HxQabcdefghijklmnopqrstu"].join("_")]: "apiKey",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789": "accessToken",
    "AKIAIOSFODNN7EXAMPLE": "apiKey",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIE...": "privateKey",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U": "accessToken",
    "4242 4242 4242 4242": "cardNumber",
    "  4111-1111-1111-1111 ": "cardNumber",
    "Tr0ub4dor&3xyz": "password",
  };
  for (const [text, label] of Object.entries(cases)) assert.equal(detectSensitive(text), label, text);
});

test("ordinary text is left alone", () => {
  for (const text of [
    "",
    "hello world",
    "4242 4242 4242 4241",
    "0000 0000 0000 0000",
    "https://Example.com/Path?Query=1",
    "Person.Name@example.com",
    "const value = getValue(1);",
    "ProjectPlan2026",
    "x".repeat(6000),
  ]) assert.equal(detectSensitive(text), null, text);
});

test("each kind has a readable label", () => {
  assert.equal(sensitiveLabel("apiKey"), "an API key");
  assert.equal(sensitiveLabel("cardNumber"), "a card number");
});
