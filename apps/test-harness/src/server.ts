import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadTestHarnessConfig, type TestHarnessConfig } from "./config.js";
import { renderTestHarnessPage } from "./page.js";
import { consumeTestHarnessToken } from "./token-verification.js";

const maximumRequestBodyBytes = 16 * 1024;
const browserSdkDirectory = new URL(
  "../../../packages/browser-sdk/dist/",
  import.meta.url,
);

export function createTestHarnessServer(config: TestHarnessConfig) {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, config);
    } catch {
      sendJson(response, 500, { error: "internal_error" });
    }
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: TestHarnessConfig,
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", config.publicOrigin);

  if (request.method === "GET" && requestUrl.pathname === "/health/ready") {
    sendJson(response, 200, { status: "ready" });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      renderTestHarnessPage({
        apiOrigin: config.apiOrigin,
        publicSiteKey: config.publicSiteKey,
        action: config.action,
      }),
    );
    return;
  }

  if (request.method === "GET" && isBrowserSdkAsset(requestUrl.pathname)) {
    const asset = await readFile(
      new URL(
        requestUrl.pathname.slice("/assets/tracecaptcha/".length),
        browserSdkDirectory,
      ),
      "utf8",
    );
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(asset);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/verify") {
    await handleTokenVerification(request, response, config);
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

async function handleTokenVerification(
  request: IncomingMessage,
  response: ServerResponse,
  config: TestHarnessConfig,
): Promise<void> {
  if (!isTrustedBrowserOrigin(request.headers.origin, config.publicOrigin)) {
    sendJson(response, 403, { authorized: false });
    return;
  }

  const body = await readJsonBody(request);
  if (!isTokenSubmission(body)) {
    sendJson(response, 400, { authorized: false });
    return;
  }

  const outcome = await consumeTestHarnessToken({
    apiOrigin: config.apiOrigin,
    privateServerCredential: config.privateServerCredential,
    expectedAction: config.action,
    token: body.token,
  });

  if (outcome.kind === "verified") {
    sendJson(response, 201, { authorized: true });
    return;
  }
  if (outcome.kind === "unavailable") {
    sendJson(response, 503, { authorized: false });
    return;
  }
  sendJson(response, 403, { authorized: false });
}

export function isTrustedBrowserOrigin(
  origin: string | undefined,
  publicOrigin: string,
): boolean {
  return origin === publicOrigin;
}

function isBrowserSdkAsset(pathname: string): boolean {
  return (
    pathname === "/assets/tracecaptcha/index.js" ||
    pathname === "/assets/tracecaptcha/web-component.js"
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumRequestBodyBytes) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function isTokenSubmission(value: unknown): value is { token: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>).token === "string"
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const config = loadTestHarnessConfig();
  const server = createTestHarnessServer(config);
  server.listen({ host: config.host, port: config.port });
}
