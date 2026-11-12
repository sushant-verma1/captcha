import assert from "node:assert/strict";
import test from "node:test";

import { TraceCaptcha } from "./react.js";

test("exports the React adapter without requiring browser globals at import time", () => {
  assert.ok(TraceCaptcha);
});
