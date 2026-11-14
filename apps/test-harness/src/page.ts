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
      .debug-panel { background: #ffffff; border: 1px solid #cbd5e1; border-radius: .5rem; margin-top: 1.5rem; padding: 1rem; }
      .debug-panel h2 { font-size: 1rem; margin: 0; }
      .debug-panel dl { display: grid; gap: .5rem; margin: 1rem 0; }
      .debug-panel dl div { display: grid; gap: .25rem; grid-template-columns: minmax(9rem, 1fr) 2fr; }
      .debug-panel dt { color: #475569; font-weight: 600; }
      .debug-panel dd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; overflow-wrap: anywhere; }
      .debug-note { color: #475569; font-size: .875rem; margin-bottom: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>TraceCAPTCHA test harness</h1>
      <p class="notice">This page is an integration test only. Browser state is never authorization; only the server-side token-consumption result can authorize this test outcome.</p>
      <trace-captcha id="captcha"></trace-captcha>
      <section class="debug-panel" aria-labelledby="debug-heading">
        <h2 id="debug-heading">Safe test diagnostics</h2>
        <p>These values are for this staging harness only. They never authorize the test action.</p>
        <dl>
          <div><dt>Widget state</dt><dd id="debug-state">waiting</dd></div>
          <div><dt>Server decision</dt><dd id="debug-decision">not received</dd></div>
          <div><dt>Reason category</dt><dd id="debug-reason">not received</dd></div>
          <div><dt>Verification token</dt><dd id="debug-token">not issued</dd></div>
          <div><dt>Numeric score</dt><dd>not produced or exposed</dd></div>
        </dl>
        <p class="debug-note">The server keeps thresholds, detailed measurements, and raw traces private. Use the safe decision and reason category to guide calibration.</p>
      </section>
      <p id="result" role="status" aria-live="polite">Waiting for a verification decision.</p>
    </main>
    <script type="module" nonce="${nonce}">
      import { defineTraceCaptchaElement } from "/assets/tracecaptcha/web-component.js";

      const config = ${config};
      const captcha = document.querySelector("#captcha");
      const result = document.querySelector("#result");
      const debugState = document.querySelector("#debug-state");
      const debugDecision = document.querySelector("#debug-decision");
      const debugReason = document.querySelector("#debug-reason");
      const debugToken = document.querySelector("#debug-token");

      function setDebugText(element, value) {
        element.textContent = typeof value === "string" && value.length > 0 ? value : "not received";
      }

      function updateDiagnostics(detail) {
        const verification = detail && typeof detail.verification === "object" && detail.verification !== null
          ? detail.verification
          : undefined;
        const decision = detail && typeof detail.decision === "object" && detail.decision !== null
          ? detail.decision
          : undefined;

        setDebugText(debugState, detail && detail.state);
        setDebugText(debugDecision, verification?.decision ?? decision?.decision);
        setDebugText(debugReason, verification?.reasonCategory ?? decision?.reasonCategory);
        debugToken.textContent = typeof verification?.verificationToken === "string"
          ? "issued; awaiting server-side consumption"
          : "not issued";
      }

      defineTraceCaptchaElement();
      captcha.setAttribute("site-key", config.publicSiteKey);
      captcha.setAttribute("endpoint", config.apiOrigin);
      captcha.setAttribute("action", config.action);

      captcha.addEventListener("tracecaptcha-statechange", async (event) => {
        const detail = event.detail;
        updateDiagnostics(detail);
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
