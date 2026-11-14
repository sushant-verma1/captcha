import { randomBytes } from "node:crypto";

import type { TestHarnessAction } from "./config.js";

export type RenderedTestHarnessPage = {
  html: string;
  contentSecurityPolicy: string;
};

export function renderTestHarnessPage(input: {
  apiOrigin: string;
  publicSiteKey: string;
  action: TestHarnessAction;
}): RenderedTestHarnessPage {
  const nonce = randomBytes(16).toString("base64");
  const contentSecurityPolicy = [
    "default-src 'self'",
    `connect-src 'self' ${input.apiOrigin}`,
    "img-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const config = JSON.stringify({
    apiOrigin: input.apiOrigin,
    publicSiteKey: input.publicSiteKey,
    action: input.action,
  }).replace(/</g, "\\u003c");

  return {
    contentSecurityPolicy,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TraceCAPTCHA test harness</title>
    <style>
      body { background: #f8fafc; color: #0f172a; font: 16px/1.5 system-ui, sans-serif; margin: 0; }
      main { margin: 0 auto; max-width: 42rem; padding: 2rem 1rem; }
      .notice { background: #e0f2fe; border: 1px solid #7dd3fc; border-radius: .5rem; padding: 1rem; }
      #result { font-weight: 600; min-height: 1.5rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>TraceCAPTCHA test harness</h1>
      <p class="notice">This page is an integration test only. Browser state is never authorization; only the server-side token-consumption result can authorize this test outcome.</p>
      <trace-captcha id="captcha"></trace-captcha>
      <p id="result" role="status" aria-live="polite">Waiting for a verification decision.</p>
    </main>
    <script type="module" nonce="${nonce}">
      import { defineTraceCaptchaElement } from "/assets/tracecaptcha/web-component.js";

      const config = ${config};
      const captcha = document.querySelector("#captcha");
      const result = document.querySelector("#result");
      defineTraceCaptchaElement();
      captcha.setAttribute("site-key", config.publicSiteKey);
      captcha.setAttribute("endpoint", config.apiOrigin);
      captcha.setAttribute("action", config.action);

      captcha.addEventListener("tracecaptcha-statechange", async (event) => {
        const detail = event.detail;
        if (detail.state === "allow") {
          result.textContent = "No challenge is required by policy. This test page does not treat that browser state as authorization.";
          return;
        }
        if (detail.state !== "success" || typeof detail.verification?.verificationToken !== "string") {
          return;
        }
        result.textContent = "Server-side token verification is in progress.";
        try {
          const response = await fetch("/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: detail.verification.verificationToken }),
          });
          const body = await response.json();
          result.textContent = response.status === 201 && body.authorized === true
            ? "The test backend verified and consumed the token."
            : response.status === 503
              ? "Verification is temporarily unavailable."
              : "The test backend did not authorize this request.";
        } catch {
          result.textContent = "Verification is temporarily unavailable.";
        }
      });
    </script>
  </body>
</html>`,
  };
}
