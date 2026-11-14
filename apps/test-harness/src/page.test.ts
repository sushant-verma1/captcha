import assert from "node:assert/strict";
import test from "node:test";

import { renderTestHarnessPage } from "./page.js";

test("renders public browser configuration without the private credential", () => {
  const page = renderTestHarnessPage({
    apiOrigin: "https://captcha.example.test",
    publicSiteKey: "tc_site_test",
    action: "password_reset",
  });

  assert.match(page.html, /tc_site_test/);
  assert.match(page.html, /\/verify/);
  assert.match(page.html, /tracecaptcha-statechange/);
  assert.doesNotMatch(page.html, /tc_server_/);
  assert.match(page.html, /Browser state is never authorization/);
  assert.doesNotMatch(page.html, /frame-ancestors/);
  assert.match(page.contentSecurityPolicy, /style-src 'self' 'unsafe-inline'/);
  assert.match(page.contentSecurityPolicy, /script-src 'nonce-/);
  assert.match(page.contentSecurityPolicy, /frame-ancestors 'none'/);
});
