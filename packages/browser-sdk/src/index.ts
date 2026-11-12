import type {
  ChallengeRenderData,
  ChallengeResponse,
  DecisionType,
  DecisionResponse,
  Point,
  ProtectedAction,
  TracePoint,
  VerificationResponse,
} from "@tracecaptcha/shared-types";

export type TraceCaptchaClientOptions = {
  siteKey: string;
  endpoint: string;
  fetch?: TraceCaptchaFetch;
  onStateChange?: (event: TraceCaptchaClientStateChange) => void;
};

export type ProtectOptions = {
  action: ProtectedAction;
  sessionId?: string;
};

export type TraceCaptchaClient = {
  /**
   * Requests one decision. It never treats a network, server, or parse failure
   * as authorization and rejects with TraceCaptchaClientError instead.
   */
  protect(options: ProtectOptions): Promise<DecisionResponse>;
  /** Returns the latest public request or decision state for this client. */
  getState(): TraceCaptchaClientState;
  /** Idempotently aborts an in-flight request and disables this instance. */
  destroy(): void;
};

export type TraceCaptchaClientState =
  "idle" | "requesting" | DecisionType | "unavailable" | "destroyed";

export type TraceCaptchaClientStateChange = {
  state: TraceCaptchaClientState;
  decision?: DecisionResponse;
};

export type TraceCaptchaClientErrorCode =
  "configuration" | "request_in_progress" | "unavailable" | "destroyed";

export class TraceCaptchaClientError extends Error {
  public constructor(public readonly code: TraceCaptchaClientErrorCode) {
    super(clientErrorMessage(code));
    this.name = "TraceCaptchaClientError";
  }
}

export type TraceCaptchaFetchResponse = {
  status: number;
  json(): Promise<unknown>;
};

export type TraceCaptchaFetch = (
  input: string,
  init: RequestInit,
) => Promise<TraceCaptchaFetchResponse>;

export type ChallengeVerifierOptions = TraceCaptchaClientOptions;

/**
 * Creates a renderable owned challenge only after the public decision client
 * returned `challenge`. This is a UI flow helper, not an authorization check.
 */
export type ChallengeRequestAfterDecisionOptions = {
  siteKey: string;
  endpoint: string;
  action: ProtectedAction;
  decision: Pick<DecisionResponse, "decisionId" | "decision">;
  sessionId?: string;
  fetch?: TraceCaptchaFetch;
  signal?: AbortSignal;
};

export type ChallengeVerificationSubmission = {
  challenge: Pick<ChallengeResponse, "challengeId" | "action">;
  trace: readonly TracePoint[];
  signal?: AbortSignal;
};

export type ChallengeVerificationOutcome =
  | { kind: "accepted"; response: VerificationResponse }
  | { kind: "retry"; response: VerificationResponse }
  | { kind: "rejected"; response?: VerificationResponse }
  | { kind: "expired" }
  | { kind: "consumed" }
  | { kind: "unavailable" };

export type ChallengeVerifier = {
  submit(
    submission: ChallengeVerificationSubmission,
  ): Promise<ChallengeVerificationOutcome>;
};

export type ChallengeWidgetState =
  | "loading"
  | "drawing"
  | "submitting"
  | "success"
  | "retry"
  | "rejected"
  | "expired"
  | "consumed"
  | "unavailable"
  | "verification_disabled"
  | "fallback";

export type ChallengeRecoveryState = "retry" | "expired" | "unavailable";

export type ChallengeRenderLayout = {
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const maximumTracePoints = 2_000;
export const maximumTraceDurationMs = 120_000;

export type ChallengeCanvasRendererOptions = {
  onTraceComplete?: (trace: readonly TracePoint[]) => void;
  onFallbackRequested?: () => void;
  onResetRequested?: () => void;
  fallbackButton?: HTMLButtonElement;
  instructionsElement?: HTMLElement;
  now?: () => number;
};

export type ChallengeCanvasRenderer = {
  render(renderData: ChallengeRenderData): void;
  resize(): void;
  setState(state: ChallengeWidgetState): void;
  setRecoveryState(state: ChallengeRecoveryState): void;
  setExpiry(expiresAt: string | undefined): void;
  toChallengePoint(clientX: number, clientY: number): Point | null;
  resetTrace(): void;
  reset(): void;
  destroy(): void;
};

/**
 * Creates an independent client instance. Instances do not share state; callers
 * should retain one instance for a page lifecycle and call destroy on teardown.
 * Only one decision request may be active per instance at a time.
 */
export function createTraceCaptchaClient(
  options: TraceCaptchaClientOptions,
): TraceCaptchaClient {
  if (!isUsableClientOptions(options)) {
    throw new TraceCaptchaClientError("configuration");
  }

  const siteKey = options.siteKey.trim();
  const endpoint = decisionEndpoint(options.endpoint);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  let state: TraceCaptchaClientState = "idle";
  let pending = false;
  let destroyed = false;
  let abortController: AbortController | undefined;

  if (fetchImplementation === undefined) {
    throw new TraceCaptchaClientError("configuration");
  }

  const transition = (
    nextState: TraceCaptchaClientState,
    decision?: DecisionResponse,
  ): void => {
    state = nextState;
    try {
      options.onStateChange?.({
        state: nextState,
        ...(decision === undefined ? {} : { decision }),
      });
    } catch {
      // Customer event handlers cannot affect this security-sensitive flow.
    }
  };

  return {
    async protect(protectOptions: ProtectOptions): Promise<DecisionResponse> {
      if (destroyed) {
        throw new TraceCaptchaClientError("destroyed");
      }

      if (pending) {
        throw new TraceCaptchaClientError("request_in_progress");
      }

      if (!isUsableProtectOptions(protectOptions)) {
        throw new TraceCaptchaClientError("configuration");
      }

      pending = true;
      abortController = new AbortController();
      transition("requesting");

      try {
        const response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-TraceCAPTCHA-Site-Key": siteKey,
          },
          body: JSON.stringify({
            action: protectOptions.action,
            ...(protectOptions.sessionId === undefined
              ? {}
              : { sessionId: protectOptions.sessionId }),
          }),
          signal: abortController.signal,
        });

        if (response.status !== 200) {
          throw new TraceCaptchaClientError("unavailable");
        }

        const decision = await readDecisionResponse(response);
        if (decision === undefined) {
          throw new TraceCaptchaClientError("unavailable");
        }

        transition(decision.decision, decision);
        return decision;
      } catch (error) {
        const clientError =
          error instanceof TraceCaptchaClientError
            ? error
            : new TraceCaptchaClientError(
                destroyed ? "destroyed" : "unavailable",
              );
        if (!destroyed) {
          transition("unavailable");
        }
        throw clientError;
      } finally {
        pending = false;
        abortController = undefined;
      }
    },
    getState(): TraceCaptchaClientState {
      return state;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;
      abortController?.abort();
      transition("destroyed");
    },
  };
}

/**
 * Requests one fresh owned challenge for a public `challenge` decision. A
 * browser can never use this result, or any later widget state, to authorize
 * the protected action; that remains a server-side token-verification step.
 */
export async function requestChallengeAfterDecision(
  options: ChallengeRequestAfterDecisionOptions,
): Promise<ChallengeResponse> {
  if (!isUsableChallengeRequestAfterDecisionOptions(options)) {
    throw new TraceCaptchaClientError("configuration");
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new TraceCaptchaClientError("configuration");
  }

  let response: TraceCaptchaFetchResponse;

  try {
    response = await fetchImplementation(
      challengeCreationEndpoint(options.endpoint),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TraceCAPTCHA-Site-Key": options.siteKey.trim(),
        },
        body: JSON.stringify({
          action: options.action,
          decisionId: options.decision.decisionId,
          ...(options.sessionId === undefined
            ? {}
            : { sessionId: options.sessionId }),
        }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
  } catch {
    throw new TraceCaptchaClientError("unavailable");
  }

  if (response.status !== 201) {
    throw new TraceCaptchaClientError("unavailable");
  }

  const challenge = await readChallengeResponse(response, options.action);
  if (challenge === undefined) {
    throw new TraceCaptchaClientError("unavailable");
  }

  return challenge;
}

export function createChallengeVerifier(
  options: ChallengeVerifierOptions,
): ChallengeVerifier {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    async submit(
      submission: ChallengeVerificationSubmission,
    ): Promise<ChallengeVerificationOutcome> {
      if (
        fetchImplementation === undefined ||
        !isUsableChallengeBinding(submission.challenge) ||
        options.siteKey.trim().length === 0
      ) {
        return { kind: "unavailable" };
      }

      let endpoint: string;

      try {
        endpoint = challengeVerificationEndpoint(
          options.endpoint,
          submission.challenge.challengeId,
        );
      } catch {
        return { kind: "unavailable" };
      }

      let response: TraceCaptchaFetchResponse;

      try {
        response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-TraceCAPTCHA-Site-Key": options.siteKey,
          },
          body: JSON.stringify({
            action: submission.challenge.action,
            trace: submission.trace,
          }),
          ...(submission.signal === undefined
            ? {}
            : { signal: submission.signal }),
        });
      } catch {
        return { kind: "unavailable" };
      }

      if (response.status === 410) {
        return { kind: "expired" };
      }

      if (response.status === 409) {
        return { kind: "consumed" };
      }

      if (response.status !== 200) {
        return response.status === 400 ||
          response.status === 401 ||
          response.status === 404
          ? { kind: "rejected" }
          : { kind: "unavailable" };
      }

      const verificationResponse = await readVerificationResponse(response);

      if (verificationResponse === undefined) {
        return { kind: "unavailable" };
      }

      if (verificationResponse.decision === "allow") {
        if (
          typeof verificationResponse.verificationToken !== "string" ||
          verificationResponse.verificationToken.trim().length === 0 ||
          typeof verificationResponse.expiresAt !== "string" ||
          !Number.isFinite(Date.parse(verificationResponse.expiresAt))
        ) {
          return { kind: "unavailable" };
        }

        return { kind: "accepted", response: verificationResponse };
      }

      if (verificationResponse.decision === "retry") {
        return { kind: "retry", response: verificationResponse };
      }

      return { kind: "rejected", response: verificationResponse };
    },
  };
}

export async function submitChallengeTrace(
  renderer: Pick<ChallengeCanvasRenderer, "setState">,
  verifier: ChallengeVerifier,
  submission: ChallengeVerificationSubmission,
): Promise<ChallengeVerificationOutcome> {
  renderer.setState("submitting");
  const outcome = await verifier.submit(submission);
  renderer.setState(challengeWidgetStateForVerificationOutcome(outcome));
  return outcome;
}

export function challengeWidgetStateForVerificationOutcome(
  outcome: ChallengeVerificationOutcome,
): ChallengeWidgetState {
  switch (outcome.kind) {
    case "accepted":
      return "success";
    case "retry":
      return "retry";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "consumed":
      return "consumed";
    case "unavailable":
      return "unavailable";
  }
}

export class PointerTraceCollector {
  private activePointerId: number | undefined;
  private startedAt: number | undefined;
  private points: TracePoint[] = [];

  public constructor(
    private readonly now: () => number = () => performance.now(),
  ) {}

  public begin(pointerId: number, point: Point): boolean {
    if (this.activePointerId !== undefined) {
      return false;
    }

    this.activePointerId = pointerId;
    this.startedAt = this.now();
    this.points = [];
    this.append(pointerId, point);
    return true;
  }

  public append(pointerId: number, point: Point | null): boolean {
    if (
      this.activePointerId !== pointerId ||
      this.startedAt === undefined ||
      point === null
    ) {
      return false;
    }

    const elapsed = Math.round(this.now() - this.startedAt);

    if (elapsed < 0 || elapsed > maximumTraceDurationMs) {
      this.reset();
      return false;
    }

    const previous = this.points.at(-1);

    if (
      previous !== undefined &&
      previous.x === point.x &&
      previous.y === point.y &&
      previous.t === elapsed
    ) {
      return true;
    }

    if (this.points.length >= maximumTracePoints) {
      return true;
    }

    this.points.push({ x: point.x, y: point.y, t: elapsed });
    return true;
  }

  public complete(pointerId: number): TracePoint[] | null {
    if (this.activePointerId !== pointerId) {
      return null;
    }

    const trace = this.points.length >= 2 ? [...this.points] : null;
    this.reset();
    return trace;
  }

  public cancel(pointerId: number): void {
    if (this.activePointerId === pointerId) {
      this.reset();
    }
  }

  public reset(): void {
    this.activePointerId = undefined;
    this.startedAt = undefined;
    this.points = [];
  }
}

export function createChallengeCanvasRenderer(
  canvas: HTMLCanvasElement,
  statusElement?: HTMLElement,
  options: ChallengeCanvasRendererOptions = {},
): ChallengeCanvasRenderer {
  const canvasContext = canvas.getContext("2d");

  if (canvasContext === null) {
    throw new Error("TraceCAPTCHA requires a 2D canvas context.");
  }

  const context = canvasContext;

  let renderData: ChallengeRenderData | undefined;
  let layout: ChallengeRenderLayout | undefined;
  let widgetState: ChallengeWidgetState = "loading";
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const pointerCollector = new PointerTraceCollector(options.now);
  const fallbackButton = options.fallbackButton;
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          draw();
        });

  resizeObserver?.observe(canvas);
  canvas.style.touchAction = "none";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Trace the displayed shape to continue.");
  options.instructionsElement?.replaceChildren(
    "Trace the displayed shape to continue.",
  );
  if (statusElement !== undefined) {
    statusElement.setAttribute("role", "status");
    statusElement.setAttribute("aria-live", "polite");
  }
  if (fallbackButton !== undefined) {
    fallbackButton.type = "button";
    fallbackButton.hidden = true;
    fallbackButton.textContent = "Use another verification option";
    fallbackButton.addEventListener("click", onFallbackRequested);
  }
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);
  canvas.addEventListener("keydown", onKeyDown);

  function render(nextRenderData: ChallengeRenderData): void {
    assertRenderData(nextRenderData);
    renderData = nextRenderData;
    canvas.style.width = "100%";
    canvas.style.aspectRatio = `${nextRenderData.canvas.width} / ${nextRenderData.canvas.height}`;
    setState("drawing");
    draw();
  }

  function resize(): void {
    draw();
  }

  function setState(state: ChallengeWidgetState): void {
    pointerCollector.reset();
    widgetState = state;
    canvas.dataset.tracecaptchaState = state;
    canvas.setAttribute(
      "aria-disabled",
      state === "drawing" ? "false" : "true",
    );

    if (fallbackButton !== undefined) {
      fallbackButton.hidden = !needsFallback(state);
    }

    if (statusElement !== undefined) {
      statusElement.textContent = stateMessage(state);
    }
  }

  function setRecoveryState(recoveryState: ChallengeRecoveryState): void {
    setState(recoveryState);
  }

  function setExpiry(expiresAt: string | undefined): void {
    if (expiryTimer !== undefined) {
      clearTimeout(expiryTimer);
      expiryTimer = undefined;
    }

    const delay = challengeExpiryDelayMs(expiresAt);

    if (delay === null) {
      return;
    }

    expiryTimer = setTimeout(() => {
      expiryTimer = undefined;
      setState("expired");
    }, delay);
  }

  function toChallengePoint(clientX: number, clientY: number): Point | null {
    if (layout === undefined) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();
    return mapViewportPointToChallenge(
      { x: clientX - bounds.left, y: clientY - bounds.top },
      layout,
      renderData?.canvas,
    );
  }

  function resetTrace(): void {
    pointerCollector.reset();
  }

  function reset(): void {
    pointerCollector.reset();
    setState("drawing");
    options.onResetRequested?.();
  }

  function destroy(): void {
    resizeObserver?.disconnect();
    if (expiryTimer !== undefined) {
      clearTimeout(expiryTimer);
    }
    pointerCollector.reset();
    fallbackButton?.removeEventListener("click", onFallbackRequested);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
    canvas.removeEventListener("keydown", onKeyDown);
  }

  function onPointerDown(event: PointerEvent): void {
    if (widgetState !== "drawing" || !isPrimarySupportedPointer(event)) {
      return;
    }

    const point = toChallengePoint(event.clientX, event.clientY);

    if (point === null || !pointerCollector.begin(event.pointerId, point)) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (widgetState !== "drawing" || !isPrimarySupportedPointer(event)) {
      return;
    }

    for (const coalescedEvent of pointerEvents(event)) {
      pointerCollector.append(
        event.pointerId,
        toChallengePoint(coalescedEvent.clientX, coalescedEvent.clientY),
      );
    }

    event.preventDefault();
  }

  function onPointerUp(event: PointerEvent): void {
    if (widgetState !== "drawing" || !isPrimarySupportedPointer(event)) {
      return;
    }

    for (const coalescedEvent of pointerEvents(event)) {
      pointerCollector.append(
        event.pointerId,
        toChallengePoint(coalescedEvent.clientX, coalescedEvent.clientY),
      );
    }

    const trace = pointerCollector.complete(event.pointerId);

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (trace !== null) {
      options.onTraceComplete?.(trace);
    }

    event.preventDefault();
  }

  function onPointerCancel(event: PointerEvent): void {
    pointerCollector.cancel(event.pointerId);
  }

  function onPointerLeave(event: PointerEvent): void {
    pointerCollector.cancel(event.pointerId);
  }

  function onLostPointerCapture(event: PointerEvent): void {
    pointerCollector.cancel(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      reset();
      event.preventDefault();
    }
  }

  function onFallbackRequested(): void {
    pointerCollector.reset();
    setState("fallback");
    options.onFallbackRequested?.();
  }

  function draw(): void {
    if (renderData === undefined) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();

    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(bounds.width * devicePixelRatio);
    canvas.height = Math.round(bounds.height * devicePixelRatio);
    layout = calculateChallengeRenderLayout(renderData.canvas, {
      width: bounds.width,
      height: bounds.height,
    });

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, bounds.width, bounds.height);
    drawPolygon(context, renderData, layout);
  }

  return {
    render,
    resize,
    setState,
    setRecoveryState,
    setExpiry,
    toChallengePoint,
    resetTrace,
    reset,
    destroy,
  };
}

export function calculateChallengeRenderLayout(
  canvas: { width: number; height: number },
  viewport: { width: number; height: number },
): ChallengeRenderLayout {
  const scale = Math.min(
    viewport.width / canvas.width,
    viewport.height / canvas.height,
  );
  const renderedWidth = canvas.width * scale;
  const renderedHeight = canvas.height * scale;

  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    scale,
    offsetX: (viewport.width - renderedWidth) / 2,
    offsetY: (viewport.height - renderedHeight) / 2,
  };
}

export function mapViewportPointToChallenge(
  point: Point,
  layout: ChallengeRenderLayout,
  canvas: { width: number; height: number } | undefined,
): Point | null {
  if (canvas === undefined || layout.scale <= 0) {
    return null;
  }

  const x = (point.x - layout.offsetX) / layout.scale;
  const y = (point.y - layout.offsetY) / layout.scale;

  if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
    return null;
  }

  return { x, y };
}

export function challengeExpiryDelayMs(
  expiresAt: string | undefined,
  now: number = Date.now(),
): number | null {
  if (expiresAt === undefined) {
    return null;
  }

  const expiry = Date.parse(expiresAt);

  if (!Number.isFinite(expiry)) {
    return null;
  }

  return Math.max(0, expiry - now);
}

function assertRenderData(renderData: ChallengeRenderData): void {
  const { canvas, target, version } = renderData;

  if (
    !Number.isInteger(version) ||
    version < 1 ||
    !Number.isInteger(canvas.width) ||
    !Number.isInteger(canvas.height) ||
    canvas.width < 120 ||
    canvas.width > 1_024 ||
    canvas.height < 120 ||
    canvas.height > 1_024 ||
    target.kind !== "polygon" ||
    target.displayPath.length < 3 ||
    target.displayPath.length > 32 ||
    target.displayPath.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > canvas.width ||
        point.y < 0 ||
        point.y > canvas.height,
    )
  ) {
    throw new Error("TraceCAPTCHA received invalid challenge render data.");
  }
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  renderData: ChallengeRenderData,
  layout: ChallengeRenderLayout,
): void {
  const [firstPoint, ...remainingPoints] = renderData.target.displayPath;

  if (firstPoint === undefined) {
    return;
  }

  context.beginPath();
  context.moveTo(
    layout.offsetX + firstPoint.x * layout.scale,
    layout.offsetY + firstPoint.y * layout.scale,
  );

  for (const point of remainingPoints) {
    context.lineTo(
      layout.offsetX + point.x * layout.scale,
      layout.offsetY + point.y * layout.scale,
    );
  }

  context.closePath();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, Math.min(8, 5 * layout.scale));
  context.strokeStyle = "#475569";
  context.stroke();
}

function stateMessage(state: ChallengeWidgetState): string {
  switch (state) {
    case "loading":
      return "Loading challenge.";
    case "drawing":
      return "Trace the shape to continue.";
    case "submitting":
      return "Checking your trace.";
    case "success":
      return "Challenge complete.";
    case "retry":
      return "Please try a new challenge.";
    case "rejected":
      return "This trace was not accepted. Follow your site's next verification step.";
    case "expired":
      return "This challenge has expired. Request a new challenge to continue.";
    case "consumed":
      return "This challenge has already been used. Request a new challenge to continue.";
    case "unavailable":
      return "Verification is temporarily unavailable. Please try again later.";
    case "verification_disabled":
      return "Your trace was collected, but server verification is not enabled. Use another verification option.";
    case "fallback":
      return "Another verification option has been requested.";
  }
}

function needsFallback(state: ChallengeWidgetState): boolean {
  return (
    state === "retry" ||
    state === "expired" ||
    state === "unavailable" ||
    state === "verification_disabled"
  );
}

function decisionEndpoint(endpoint: string): string {
  let apiBase: URL;
  try {
    apiBase = new URL(endpoint);
  } catch {
    throw new TraceCaptchaClientError("configuration");
  }

  if (apiBase.protocol !== "https:" && apiBase.protocol !== "http:") {
    throw new TraceCaptchaClientError("configuration");
  }

  apiBase.pathname = apiBase.pathname.endsWith("/")
    ? apiBase.pathname
    : `${apiBase.pathname}/`;
  return new URL("v1/decisions", apiBase).toString();
}

function challengeVerificationEndpoint(
  endpoint: string,
  challengeId: string,
): string {
  const apiBase = new URL(endpoint);
  apiBase.pathname = apiBase.pathname.endsWith("/")
    ? apiBase.pathname
    : `${apiBase.pathname}/`;

  return new URL(
    `v1/challenges/${encodeURIComponent(challengeId)}/verify`,
    apiBase,
  ).toString();
}

function challengeCreationEndpoint(endpoint: string): string {
  let apiBase: URL;
  try {
    apiBase = new URL(endpoint);
  } catch {
    throw new TraceCaptchaClientError("configuration");
  }

  if (apiBase.protocol !== "https:" && apiBase.protocol !== "http:") {
    throw new TraceCaptchaClientError("configuration");
  }

  apiBase.pathname = apiBase.pathname.endsWith("/")
    ? apiBase.pathname
    : `${apiBase.pathname}/`;
  return new URL("v1/challenges", apiBase).toString();
}

function isUsableClientOptions(
  options: unknown,
): options is TraceCaptchaClientOptions {
  const candidate = options as {
    siteKey?: unknown;
    endpoint?: unknown;
    fetch?: unknown;
    onStateChange?: unknown;
  };
  return (
    options !== null &&
    typeof options === "object" &&
    typeof candidate.siteKey === "string" &&
    candidate.siteKey.trim().length > 0 &&
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.trim().length > 0 &&
    (candidate.fetch === undefined || typeof candidate.fetch === "function") &&
    (candidate.onStateChange === undefined ||
      typeof candidate.onStateChange === "function")
  );
}

function isUsableProtectOptions(options: unknown): options is ProtectOptions {
  const candidate = options as { action?: unknown; sessionId?: unknown };
  return (
    options !== null &&
    typeof options === "object" &&
    typeof candidate.action === "string" &&
    candidate.action.trim().length > 0 &&
    candidate.action.length <= 100 &&
    (candidate.sessionId === undefined ||
      (typeof candidate.sessionId === "string" &&
        candidate.sessionId.length > 0 &&
        candidate.sessionId.length <= 255))
  );
}

function isUsableChallengeRequestAfterDecisionOptions(
  options: unknown,
): options is ChallengeRequestAfterDecisionOptions {
  if (options === null || typeof options !== "object") {
    return false;
  }

  const candidate = options as {
    siteKey?: unknown;
    endpoint?: unknown;
    action?: unknown;
    decision?: unknown;
    sessionId?: unknown;
  };

  return (
    typeof candidate.siteKey === "string" &&
    candidate.siteKey.trim().length > 0 &&
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.trim().length > 0 &&
    typeof candidate.action === "string" &&
    candidate.action.trim().length > 0 &&
    candidate.action.length <= 100 &&
    candidate.decision !== null &&
    typeof candidate.decision === "object" &&
    (candidate.decision as { decision?: unknown }).decision === "challenge" &&
    typeof (candidate.decision as { decisionId?: unknown }).decisionId ===
      "string" &&
    (candidate.decision as { decisionId: string }).decisionId.trim().length >
      0 &&
    (candidate.decision as { decisionId: string }).decisionId.length <= 255 &&
    (candidate.sessionId === undefined ||
      (typeof candidate.sessionId === "string" &&
        candidate.sessionId.length > 0 &&
        candidate.sessionId.length <= 255))
  );
}

function isUsableChallengeBinding(
  challenge: Pick<ChallengeResponse, "challengeId" | "action">,
): boolean {
  return (
    challenge.challengeId.trim().length > 0 &&
    challenge.action.trim().length > 0
  );
}

async function readVerificationResponse(
  response: TraceCaptchaFetchResponse,
): Promise<VerificationResponse | undefined> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("decision" in body) ||
    !isDecisionType(body.decision)
  ) {
    return undefined;
  }

  const verificationResponse: VerificationResponse = {
    decision: body.decision,
  };

  if (
    "verificationToken" in body &&
    typeof body.verificationToken === "string"
  ) {
    verificationResponse.verificationToken = body.verificationToken;
  }

  if ("expiresAt" in body && typeof body.expiresAt === "string") {
    verificationResponse.expiresAt = body.expiresAt;
  }

  if ("reasonCategory" in body && typeof body.reasonCategory === "string") {
    verificationResponse.reasonCategory = body.reasonCategory;
  }

  return verificationResponse;
}

async function readDecisionResponse(
  response: TraceCaptchaFetchResponse,
): Promise<DecisionResponse | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("decisionId" in body) ||
    typeof body.decisionId !== "string" ||
    body.decisionId.trim().length === 0 ||
    body.decisionId.length > 255 ||
    !("decision" in body) ||
    !isDecisionType(body.decision)
  ) {
    return undefined;
  }

  return {
    decisionId: body.decisionId,
    decision: body.decision,
  };
}

async function readChallengeResponse(
  response: TraceCaptchaFetchResponse,
  expectedAction: ProtectedAction,
): Promise<ChallengeResponse | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  if (
    body === null ||
    typeof body !== "object" ||
    !("challengeId" in body) ||
    typeof body.challengeId !== "string" ||
    body.challengeId.trim().length === 0 ||
    body.challengeId.length > 255 ||
    !("action" in body) ||
    body.action !== expectedAction ||
    !("expiresAt" in body) ||
    typeof body.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(body.expiresAt)) ||
    !("renderData" in body) ||
    !isUsableChallengeRenderData(body.renderData)
  ) {
    return undefined;
  }

  return {
    challengeId: body.challengeId,
    action: body.action,
    expiresAt: body.expiresAt,
    renderData: body.renderData,
  };
}

function isUsableChallengeRenderData(
  value: unknown,
): value is ChallengeRenderData {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    canvas?: { width?: unknown; height?: unknown };
    target?: { kind?: unknown; displayPath?: unknown };
  };

  return (
    Number.isInteger(candidate.version) &&
    (candidate.version as number) >= 1 &&
    Number.isInteger(candidate.canvas?.width) &&
    (candidate.canvas?.width as number) >= 120 &&
    (candidate.canvas?.width as number) <= 1_024 &&
    Number.isInteger(candidate.canvas?.height) &&
    (candidate.canvas?.height as number) >= 120 &&
    (candidate.canvas?.height as number) <= 1_024 &&
    candidate.target?.kind === "polygon" &&
    Array.isArray(candidate.target.displayPath) &&
    candidate.target.displayPath.length >= 3 &&
    candidate.target.displayPath.length <= 32 &&
    candidate.target.displayPath.every(
      (point) =>
        point !== null &&
        typeof point === "object" &&
        Number.isFinite((point as Point).x) &&
        Number.isFinite((point as Point).y) &&
        (point as Point).x >= 0 &&
        (point as Point).x <= (candidate.canvas?.width as number) &&
        (point as Point).y >= 0 &&
        (point as Point).y <= (candidate.canvas?.height as number),
    )
  );
}

function isDecisionType(
  value: unknown,
): value is VerificationResponse["decision"] {
  return (
    value === "allow" ||
    value === "challenge" ||
    value === "retry" ||
    value === "cooldown" ||
    value === "block"
  );
}

function clientErrorMessage(code: TraceCaptchaClientErrorCode): string {
  switch (code) {
    case "configuration":
      return "TraceCAPTCHA client configuration is invalid.";
    case "request_in_progress":
      return "A TraceCAPTCHA decision request is already in progress.";
    case "unavailable":
      return "TraceCAPTCHA is temporarily unavailable. Please try again.";
    case "destroyed":
      return "The TraceCAPTCHA client has been destroyed.";
  }
}

export {
  defineTraceCaptchaElement,
  traceCaptchaElementName,
  TraceCaptchaElement,
} from "./web-component.js";
export type {
  TraceCaptchaElementState,
  TraceCaptchaElementStateChange,
} from "./web-component.js";

function isPrimarySupportedPointer(event: PointerEvent): boolean {
  return (
    event.isPrimary && !(event.pointerType === "mouse" && event.button !== 0)
  );
}

function pointerEvents(event: PointerEvent): readonly PointerEvent[] {
  const coalescedEvents = event.getCoalescedEvents?.();
  return coalescedEvents === undefined || coalescedEvents.length === 0
    ? [event]
    : coalescedEvents;
}
