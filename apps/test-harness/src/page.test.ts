import assert from "node:assert/strict";
import test from "node:test";

import { renderTestHarnessPage } from "./page.js";

test("renders public browser configuration without the private credential", () => {
  const page = renderTestHarnessPage({
    apiOrigin: "https://captcha.example.test",
    publicSiteKey: "tc_site_test",
    action: "password_reset",
  });

  assert.match(page, /tc_site_test/);
  assert.match(page, /\/verify/);
  assert.match(page, /tracecaptcha-statechange/);
  assert.doesNotMatch(page, /tc_server_/);
  assert.match(page, /Browser state is never authorization/);
});
