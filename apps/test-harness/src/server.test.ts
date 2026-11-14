import assert from "node:assert/strict";
import test from "node:test";

import { isTrustedBrowserOrigin } from "./server.js";

test("accepts token submissions only from the configured test-page origin", () => {
  assert.equal(
    isTrustedBrowserOrigin(
      "https://harness.example.test",
      "https://harness.example.test",
    ),
    true,
  );
  assert.equal(
    isTrustedBrowserOrigin(
      "https://other.example.test",
      "https://harness.example.test",
    ),
    false,
  );
  assert.equal(
    isTrustedBrowserOrigin(undefined, "https://harness.example.test"),
    false,
  );
});
