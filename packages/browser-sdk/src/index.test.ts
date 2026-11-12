import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateChallengeRenderLayout,
  challengeWidgetStateForVerificationOutcome,
  challengeExpiryDelayMs,
  createChallengeVerifier,
  createTraceCaptchaClient,
  mapViewportPointToChallenge,
  maximumTracePoints,
  PointerTraceCollector,
  requestChallengeAfterDecision,
  submitChallengeTrace,
  TraceCaptchaClientError,
} from "./index.js";

test("requests a decision with only the documented browser input", async () => {
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;
  const states: string[] = [];
  const client = createTraceCaptchaClient({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test/tracecaptcha",
    onStateChange: ({ state }) => states.push(state),
    fetch: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        status: 200,
        json: async () => ({
          decisionId: "dec_123",
          decision: "challenge",
          internalRule: "must-not-reach-browser-api",
        }),
      };
    },
  });

  const decision = await client.protect({
    action: "signup",
    sessionId: "session_123",
  });

  assert.deepEqual(decision, {
    decisionId: "dec_123",
    decision: "challenge",
  });
  assert.equal(
    requestUrl,
    "https://api.example.test/tracecaptcha/v1/decisions",
  );
  assert.deepEqual(requestInit?.headers, {
    "Content-Type": "application/json",
    "X-TraceCAPTCHA-Site-Key": "tc_site_test",
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    action: "signup",
    sessionId: "session_123",
  });
  assert.deepEqual(states, ["requesting", "challenge"]);
  assert.equal(client.getState(), "challenge");
});

test("never treats failed or malformed decision responses as an allow", async () => {
  const states: string[] = [];
  const unavailable = createTraceCaptchaClient({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    onStateChange: ({ state }) => states.push(state),
    fetch: async () => ({ status: 503, json: async () => ({}) }),
  });

  await assert.rejects(
    unavailable.protect({ action: "login" }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError && error.code === "unavailable",
  );
  assert.deepEqual(states, ["requesting", "unavailable"]);
  assert.equal(unavailable.getState(), "unavailable");

  const malformed = createTraceCaptchaClient({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decisionId: "dec_123", decision: "unknown" }),
    }),
  });

  await assert.rejects(
    malformed.protect({ action: "login" }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError && error.code === "unavailable",
  );
});

test("lets the customer explicitly retry after an unavailable decision", async () => {
  const states: string[] = [];
  let requests = 0;
  const client = createTraceCaptchaClient({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    onStateChange: ({ state }) => states.push(state),
    fetch: async () => {
      requests += 1;
      return requests === 1
        ? { status: 503, json: async () => ({}) }
        : {
            status: 200,
            json: async () => ({ decisionId: "dec_123", decision: "allow" }),
          };
    },
  });

  await assert.rejects(
    client.protect({ action: "signup" }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError && error.code === "unavailable",
  );
  assert.equal(requests, 1);

  assert.deepEqual(await client.protect({ action: "signup" }), {
    decisionId: "dec_123",
    decision: "allow",
  });
  assert.equal(requests, 2);
  assert.deepEqual(states, [
    "requesting",
    "unavailable",
    "requesting",
    "allow",
  ]);
});

test("keeps client instances independent and makes destroy idempotent", async () => {
  const first = createTraceCaptchaClient({
    siteKey: "tc_site_first",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decisionId: "dec_first", decision: "allow" }),
    }),
  });
  const second = createTraceCaptchaClient({
    siteKey: "tc_site_second",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decisionId: "dec_second", decision: "allow" }),
    }),
  });

  first.destroy();
  first.destroy();
  assert.equal(first.getState(), "destroyed");
  await assert.rejects(
    first.protect({ action: "signup" }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError && error.code === "destroyed",
  );
  assert.deepEqual(await second.protect({ action: "signup" }), {
    decisionId: "dec_second",
    decision: "allow",
  });
});

test("requests a fresh owned challenge only for a public challenge decision", async () => {
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;

  const challenge = await requestChallengeAfterDecision({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test/tracecaptcha",
    action: "signup",
    sessionId: "session_123",
    decision: { decisionId: "dec_123", decision: "challenge" },
    fetch: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        status: 201,
        json: async () => ({
          challengeId: "ch_123",
          action: "signup",
          expiresAt: "2026-11-12T12:02:00.000Z",
          renderData: {
            version: 1,
            canvas: { width: 320, height: 220 },
            target: {
              kind: "polygon",
              displayPath: [
                { x: 40, y: 40 },
                { x: 280, y: 40 },
                { x: 160, y: 180 },
              ],
            },
          },
        }),
      };
    },
  });

  assert.equal(
    requestUrl,
    "https://api.example.test/tracecaptcha/v1/challenges",
  );
  assert.deepEqual(requestInit?.headers, {
    "Content-Type": "application/json",
    "X-TraceCAPTCHA-Site-Key": "tc_site_test",
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    action: "signup",
    decisionId: "dec_123",
    sessionId: "session_123",
  });
  assert.deepEqual(challenge, {
    challengeId: "ch_123",
    action: "signup",
    expiresAt: "2026-11-12T12:02:00.000Z",
    renderData: {
      version: 1,
      canvas: { width: 320, height: 220 },
      target: {
        kind: "polygon",
        displayPath: [
          { x: 40, y: 40 },
          { x: 280, y: 40 },
          { x: 160, y: 180 },
        ],
      },
    },
  });
});

test("does not request or render a challenge for a non-challenge decision", async () => {
  let calls = 0;

  await assert.rejects(
    requestChallengeAfterDecision({
      siteKey: "tc_site_test",
      endpoint: "https://api.example.test",
      action: "signup",
      decision: { decisionId: "dec_123", decision: "allow" },
      fetch: async () => {
        calls += 1;
        return { status: 201, json: async () => ({}) };
      },
    }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError &&
      error.code === "configuration",
  );

  assert.equal(calls, 0);
});

test("treats malformed owned challenge responses as unavailable", async () => {
  await assert.rejects(
    requestChallengeAfterDecision({
      siteKey: "tc_site_test",
      endpoint: "https://api.example.test",
      action: "signup",
      decision: { decisionId: "dec_123", decision: "challenge" },
      fetch: async () => ({
        status: 201,
        json: async () => ({
          challengeId: "ch_123",
          action: "login",
          expiresAt: "not-a-date",
          renderData: {},
        }),
      }),
    }),
    (error: unknown) =>
      error instanceof TraceCaptchaClientError && error.code === "unavailable",
  );
});

test("fits render coordinates into a responsive viewport without distortion", () => {
  const layout = calculateChallengeRenderLayout(
    { width: 320, height: 220 },
    { width: 640, height: 440 },
  );

  assert.deepEqual(layout, {
    viewportWidth: 640,
    viewportHeight: 440,
    scale: 2,
    offsetX: 0,
    offsetY: 0,
  });
  assert.deepEqual(
    mapViewportPointToChallenge({ x: 320, y: 220 }, layout, {
      width: 320,
      height: 220,
    }),
    { x: 160, y: 110 },
  );
});

test("keeps challenge coordinates stable when letterboxing after resize", () => {
  const canvas = { width: 320, height: 220 };
  const compactLayout = calculateChallengeRenderLayout(canvas, {
    width: 320,
    height: 320,
  });
  const wideLayout = calculateChallengeRenderLayout(canvas, {
    width: 960,
    height: 320,
  });

  assert.deepEqual(
    mapViewportPointToChallenge({ x: 160, y: 160 }, compactLayout, canvas),
    { x: 160, y: 110 },
  );
  assert.deepEqual(
    mapViewportPointToChallenge({ x: 480, y: 160 }, wideLayout, canvas),
    { x: 160, y: 110 },
  );
  assert.equal(
    mapViewportPointToChallenge({ x: 0, y: 0 }, compactLayout, canvas),
    null,
  );
});

test("collects one bounded active pointer trace with elapsed timestamps", () => {
  let now = 1_000;
  const collector = new PointerTraceCollector(() => now);

  assert.equal(collector.begin(7, { x: 10, y: 20 }), true);
  now += 18;
  assert.equal(collector.append(8, { x: 100, y: 100 }), false);
  assert.equal(collector.append(7, { x: 12, y: 23 }), true);
  now += 20;
  assert.equal(collector.append(7, { x: 15, y: 27 }), true);

  assert.deepEqual(collector.complete(7), [
    { x: 10, y: 20, t: 0 },
    { x: 12, y: 23, t: 18 },
    { x: 15, y: 27, t: 38 },
  ]);
});

test("bounds oversized traces and discards cancelled or expired pointers", () => {
  let now = 0;
  const collector = new PointerTraceCollector(() => now);

  assert.equal(collector.begin(1, { x: 0, y: 0 }), true);

  for (let index = 1; index <= maximumTracePoints + 10; index += 1) {
    now += 1;
    collector.append(1, { x: index, y: index });
  }

  assert.equal(collector.complete(1)?.length, maximumTracePoints);

  assert.equal(collector.begin(2, { x: 0, y: 0 }), true);
  collector.cancel(2);
  assert.equal(collector.complete(2), null);

  assert.equal(collector.begin(3, { x: 0, y: 0 }), true);
  now += 120_001;
  assert.equal(collector.append(3, { x: 1, y: 1 }), false);
  assert.equal(collector.complete(3), null);
});

test("derives recovery timeout delay only from a valid server expiry", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");

  assert.equal(
    challengeExpiryDelayMs("2026-11-11T12:02:00.000Z", now),
    120_000,
  );
  assert.equal(challengeExpiryDelayMs("2026-11-11T11:59:00.000Z", now), 0);
  assert.equal(challengeExpiryDelayMs("not-a-date", now), null);
  assert.equal(challengeExpiryDelayMs(undefined, now), null);
});

test("submits only the server-issued challenge binding and trace", async () => {
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;
  const verifier = createChallengeVerifier({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test/tracecaptcha",
    fetch: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        status: 200,
        json: async () => ({
          decision: "allow",
          verificationToken: "untrusted-browser-copy-only",
          expiresAt: "2026-11-11T12:05:00.000Z",
          ignoredFutureField: true,
        }),
      };
    },
  });

  const outcome = await verifier.submit({
    challenge: { challengeId: "ch_123", action: "signup" },
    trace: [
      { x: 10, y: 20, t: 0 },
      { x: 12, y: 24, t: 18 },
    ],
  });

  assert.deepEqual(outcome, {
    kind: "accepted",
    response: {
      decision: "allow",
      verificationToken: "untrusted-browser-copy-only",
      expiresAt: "2026-11-11T12:05:00.000Z",
    },
  });
  assert.equal(
    requestUrl,
    "https://api.example.test/tracecaptcha/v1/challenges/ch_123/verify",
  );
  assert.deepEqual(requestInit?.headers, {
    "Content-Type": "application/json",
    "X-TraceCAPTCHA-Site-Key": "tc_site_test",
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    action: "signup",
    trace: [
      { x: 10, y: 20, t: 0 },
      { x: 12, y: 24, t: 18 },
    ],
  });
});

test("maps only completed server outcomes to widget states", async () => {
  const states: string[] = [];
  const renderer = {
    setState: (state: string) => states.push(state),
  };
  const verifier = createChallengeVerifier({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decision: "retry" }),
    }),
  });

  const outcome = await submitChallengeTrace(renderer, verifier, {
    challenge: { challengeId: "ch_456", action: "login" },
    trace: [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 2, t: 12 },
    ],
  });

  assert.equal(outcome.kind, "retry");
  assert.deepEqual(states, ["submitting", "retry"]);
  assert.equal(
    challengeWidgetStateForVerificationOutcome({ kind: "expired" }),
    "expired",
  );
  assert.equal(
    challengeWidgetStateForVerificationOutcome({ kind: "consumed" }),
    "consumed",
  );
  assert.equal(
    challengeWidgetStateForVerificationOutcome({ kind: "unavailable" }),
    "unavailable",
  );
});

test("does not accept failed, malformed, or unavailable verification responses", async () => {
  const outcomeForStatus = async (status: number) =>
    createChallengeVerifier({
      siteKey: "tc_site_test",
      endpoint: "https://api.example.test",
      fetch: async () => ({ status, json: async () => ({}) }),
    }).submit({
      challenge: { challengeId: "ch_789", action: "otp_request" },
      trace: [
        { x: 1, y: 1, t: 0 },
        { x: 2, y: 2, t: 1 },
      ],
    });

  assert.equal((await outcomeForStatus(410)).kind, "expired");
  assert.equal((await outcomeForStatus(409)).kind, "consumed");
  assert.equal((await outcomeForStatus(503)).kind, "unavailable");
  assert.equal((await outcomeForStatus(400)).kind, "rejected");

  const malformedResponse = await createChallengeVerifier({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decision: "made_up" }),
    }),
  }).submit({
    challenge: { challengeId: "ch_malformed", action: "login" },
    trace: [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 2, t: 1 },
    ],
  });

  assert.equal(malformedResponse.kind, "unavailable");

  const missingToken = await createChallengeVerifier({
    siteKey: "tc_site_test",
    endpoint: "https://api.example.test",
    fetch: async () => ({
      status: 200,
      json: async () => ({ decision: "allow" }),
    }),
  }).submit({
    challenge: { challengeId: "ch_missing_token", action: "login" },
    trace: [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 2, t: 1 },
    ],
  });

  assert.equal(missingToken.kind, "unavailable");
});
