import type { TestHarnessAction } from "./config.js";

const maximumTokenLength = 8_192;

export type TestHarnessTokenVerificationOutcome =
  { kind: "verified" } | { kind: "invalid" } | { kind: "unavailable" };

export type TokenVerificationFetchResponse = {
  status: number;
  json(): Promise<unknown>;
};

export type TokenVerificationFetch = (
  input: string,
  init: RequestInit,
) => Promise<TokenVerificationFetchResponse>;

/**
 * The expected action is server configuration, never browser request input.
 * A successful outcome means the upstream API atomically consumed the token.
 */
export async function consumeTestHarnessToken(input: {
  apiOrigin: string;
  privateServerCredential: string;
  expectedAction: TestHarnessAction;
  token: unknown;
  fetch?: TokenVerificationFetch;
}): Promise<TestHarnessTokenVerificationOutcome> {
  if (
    typeof input.token !== "string" ||
    input.token.length === 0 ||
    input.token.length > maximumTokenLength
  ) {
    return { kind: "invalid" };
  }

  const fetchImplementation = input.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    return { kind: "unavailable" };
  }

  let response: TokenVerificationFetchResponse;
  try {
    response = await fetchImplementation(
      new URL("/v1/tokens/verify", input.apiOrigin).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TraceCAPTCHA-Secret-Key": input.privateServerCredential,
        },
        body: JSON.stringify({
          token: input.token,
          expectedAction: input.expectedAction,
          consume: true,
        }),
      },
    );
  } catch {
    return { kind: "unavailable" };
  }

  if (response.status === 503) {
    return { kind: "unavailable" };
  }
  if (response.status !== 200) {
    return { kind: "invalid" };
  }

  try {
    const body = await response.json();
    return isVerifiedResponse(body)
      ? { kind: "verified" }
      : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function isVerifiedResponse(value: unknown): value is { valid: true } {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<string, unknown>).valid === true
  );
}
