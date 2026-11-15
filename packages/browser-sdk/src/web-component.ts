import type {
  ChallengeResponse,
  DecisionResponse,
  ProtectedAction,
  TracePoint,
  VerificationResponse,
} from "@tracecaptcha/shared-types";

import {
  challengeWidgetStateForVerificationOutcome,
  createChallengeVerifier,
  createChallengeCanvasRenderer,
  createTraceCaptchaClient,
  reportChallengeAbandonment,
  requestChallengeAfterDecision,
  TraceCaptchaClientError,
  type ChallengeCanvasRenderer,
  type ChallengeVerificationOutcome,
  type ChallengeWidgetState,
  type TraceCaptchaClient,
  type TraceCaptchaClientState,
  type TraceCaptchaFetch,
} from "./index.js";

export const traceCaptchaElementName = "trace-captcha";

export type TraceCaptchaElementState =
  TraceCaptchaClientState | ChallengeWidgetState;

export type TraceCaptchaElementStateChange = {
  state: TraceCaptchaElementState;
  decision?: DecisionResponse;
  challenge?: Pick<ChallengeResponse, "challengeId" | "action" | "expiresAt">;
  /** An untrusted browser handoff for the customer backend to verify. */
  verification?: VerificationResponse;
};

const BrowserElementBase = (
  typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

/**
 * Framework-neutral wrapper for the public decision flow and owned canvas
 * renderer. Its events are UI signals only; they never authorize an action.
 */
export class TraceCaptchaElement extends BrowserElementBase {
  public static readonly observedAttributes = [
    "site-key",
    "endpoint",
    "action",
    "session-id",
  ];

  /** Optional test or platform fetch implementation; not reflected as an attribute. */
  public fetchImplementation: TraceCaptchaFetch | undefined;

  private canvas: HTMLCanvasElement | undefined;
  private fallbackButton: HTMLButtonElement | undefined;
  private instructions: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private renderer: ChallengeCanvasRenderer | undefined;
  private client: TraceCaptchaClient | undefined;
  private challengeAbortController: AbortController | undefined;
  private verificationAbortController: AbortController | undefined;
  private activeRun = 0;
  private protectScheduled = false;
  private permanentlyDestroyed = false;
  private latestDecision: DecisionResponse | undefined;
  private activeChallenge:
    Pick<ChallengeResponse, "challengeId" | "action" | "expiresAt"> | undefined;
  private latestWidgetState: TraceCaptchaElementState = "idle";

  public constructor() {
    super();

    if (typeof this.attachShadow !== "function") {
      return;
    }

    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = componentStyles;

    const wrapper = document.createElement("section");
    wrapper.setAttribute("part", "container");
    wrapper.setAttribute("aria-label", "TraceCAPTCHA verification");

    const instructions = document.createElement("p");
    instructions.setAttribute("part", "instructions");
    instructions.textContent = "Waiting for a verification decision.";

    const canvas = document.createElement("canvas");
    canvas.setAttribute("part", "canvas");
    canvas.hidden = true;

    const status = document.createElement("p");
    status.setAttribute("part", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Waiting for a verification decision.";

    const fallbackButton = document.createElement("button");
    fallbackButton.setAttribute("part", "fallback-button");
    fallbackButton.hidden = true;

    wrapper.append(instructions, canvas, status, fallbackButton);
    shadow.append(style, wrapper);

    this.canvas = canvas;
    this.instructions = instructions;
    this.status = status;
    this.fallbackButton = fallbackButton;
  }

  public get siteKey(): string {
    return this.getAttribute("site-key") ?? "";
  }

  public set siteKey(value: string) {
    this.setAttribute("site-key", value);
  }

  public get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  public set endpoint(value: string) {
    this.setAttribute("endpoint", value);
  }

  public get action(): ProtectedAction {
    return this.getAttribute("action") ?? "";
  }

  public set action(value: ProtectedAction) {
    this.setAttribute("action", value);
  }

  public get sessionId(): string | undefined {
    return this.getAttribute("session-id") ?? undefined;
  }

  public set sessionId(value: string | undefined) {
    if (value === undefined) {
      this.removeAttribute("session-id");
      return;
    }

    this.setAttribute("session-id", value);
  }

  public connectedCallback(): void {
    if (!this.permanentlyDestroyed) {
      this.scheduleProtect();
    }
  }

  public disconnectedCallback(): void {
    this.reportActiveChallengeAbandonment();
    this.cancelActiveRun();
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  public attributeChangedCallback(
    _name: string,
    previousValue: string | null,
    nextValue: string | null,
  ): void {
    if (previousValue !== nextValue && this.isConnected) {
      this.scheduleProtect();
    }
  }

  /** Requests a new policy decision; it never creates a challenge directly. */
  public async protect(): Promise<DecisionResponse> {
    if (this.permanentlyDestroyed) {
      throw new TraceCaptchaClientError("destroyed");
    }

    this.reportActiveChallengeAbandonment();
    this.cancelActiveRun();
    const run = this.activeRun;
    this.latestDecision = undefined;
    this.activeChallenge = undefined;
    this.setWidgetVisible(false);

    let client: TraceCaptchaClient;
    try {
      client = createTraceCaptchaClient({
        siteKey: this.siteKey,
        endpoint: this.endpoint,
        ...(this.fetchImplementation === undefined
          ? {}
          : { fetch: this.fetchImplementation }),
        onStateChange: (change) => {
          if (run !== this.activeRun) {
            return;
          }

          this.latestDecision = change.decision;
          this.publishState(change.state, change.decision);
        },
      });
    } catch (error) {
      this.publishState("unavailable");
      throw error;
    }

    this.client = client;

    let decision: DecisionResponse;
    try {
      decision = await client.protect({
        action: this.action,
        ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }),
      });
    } catch (error) {
      if (run === this.activeRun && !this.permanentlyDestroyed) {
        this.publishState("unavailable");
      }
      throw error;
    }

    if (run !== this.activeRun || this.permanentlyDestroyed) {
      return decision;
    }

    if (decision.decision === "challenge") {
      await this.loadChallengeAfterDecision(run, decision);
    }

    return decision;
  }

  /** Permanently aborts this element's current flow and releases listeners. */
  public destroy(): void {
    if (this.permanentlyDestroyed) {
      return;
    }

    this.reportActiveChallengeAbandonment();
    this.permanentlyDestroyed = true;
    this.cancelActiveRun();
    this.renderer?.destroy();
    this.renderer = undefined;
    this.publishState("destroyed");
  }

  private scheduleProtect(): void {
    if (this.protectScheduled || this.permanentlyDestroyed) {
      return;
    }

    this.protectScheduled = true;
    queueMicrotask(() => {
      this.protectScheduled = false;
      if (this.isConnected && !this.permanentlyDestroyed) {
        void this.protect().catch(() => undefined);
      }
    });
  }

  private cancelActiveRun(): void {
    this.activeRun += 1;
    this.challengeAbortController?.abort();
    this.challengeAbortController = undefined;
    this.verificationAbortController?.abort();
    this.verificationAbortController = undefined;
    this.client?.destroy();
    this.client = undefined;
  }

  private reportActiveChallengeAbandonment(): void {
    const challenge = this.activeChallenge;

    if (challenge === undefined || this.latestWidgetState !== "drawing") {
      return;
    }

    this.activeChallenge = undefined;
    void reportChallengeAbandonment({
      siteKey: this.siteKey,
      endpoint: this.endpoint,
      challenge,
      ...(this.fetchImplementation === undefined
        ? {}
        : { fetch: this.fetchImplementation }),
    }).catch(() => undefined);
  }

  private ensureRenderer(): ChallengeCanvasRenderer {
    if (this.renderer !== undefined) {
      return this.renderer;
    }

    if (
      this.canvas === undefined ||
      this.instructions === undefined ||
      this.status === undefined ||
      this.fallbackButton === undefined
    ) {
      throw new TraceCaptchaClientError("configuration");
    }

    this.renderer = createChallengeCanvasRenderer(this.canvas, this.status, {
      instructionsElement: this.instructions,
      fallbackButton: this.fallbackButton,
      onFallbackRequested: () => this.publishState("fallback"),
      onResetRequested: () => this.handleResetRequest(),
      onTraceComplete: (trace) => {
        void this.submitTrace(trace);
      },
    });
    return this.renderer;
  }

  private async loadChallengeAfterDecision(
    run: number,
    decision: DecisionResponse,
  ): Promise<void> {
    let renderer: ChallengeCanvasRenderer;
    try {
      renderer = this.ensureRenderer();
    } catch (error) {
      this.publishState("unavailable", decision);
      return;
    }

    this.setWidgetVisible(true);
    renderer.setState("loading");
    this.publishState("loading", decision);
    const abortController = new AbortController();
    this.challengeAbortController = abortController;

    try {
      const challenge = await requestChallengeAfterDecision({
        siteKey: this.siteKey,
        endpoint: this.endpoint,
        action: this.action,
        decision,
        ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }),
        ...(this.fetchImplementation === undefined
          ? {}
          : { fetch: this.fetchImplementation }),
        signal: abortController.signal,
      });

      if (run !== this.activeRun || this.permanentlyDestroyed) {
        return;
      }

      this.activeChallenge = {
        challengeId: challenge.challengeId,
        action: challenge.action,
        expiresAt: challenge.expiresAt,
      };
      renderer.render(challenge.renderData);
      renderer.setExpiry(challenge.expiresAt);
      this.publishState("drawing", decision, this.activeChallenge);
    } catch {
      if (run === this.activeRun && !this.permanentlyDestroyed) {
        renderer.setState("unavailable");
        this.publishState("unavailable", decision);
      }
    } finally {
      if (run === this.activeRun) {
        this.challengeAbortController = undefined;
      }
    }
  }

  private setWidgetVisible(visible: boolean): void {
    if (this.canvas !== undefined) {
      this.canvas.hidden = !visible;
    }
    if (this.instructions !== undefined) {
      this.instructions.hidden = !visible;
    }
    if (!visible && this.fallbackButton !== undefined) {
      this.fallbackButton.hidden = true;
    }
  }

  private handleResetRequest(): void {
    if (
      this.latestWidgetState === "retry" ||
      this.latestWidgetState === "rejected" ||
      this.latestWidgetState === "expired" ||
      this.latestWidgetState === "consumed" ||
      this.latestWidgetState === "unavailable"
    ) {
      void this.protect().catch(() => undefined);
      return;
    }

    this.publishState("drawing");
  }

  private async submitTrace(trace: readonly TracePoint[]): Promise<void> {
    const run = this.activeRun;
    const challenge = this.activeChallenge;
    const renderer = this.renderer;

    if (
      challenge === undefined ||
      renderer === undefined ||
      this.permanentlyDestroyed
    ) {
      return;
    }

    this.activeChallenge = undefined;

    const abortController = new AbortController();
    this.verificationAbortController = abortController;
    renderer.setState("submitting");
    this.publishState("submitting");

    let outcome: ChallengeVerificationOutcome;
    try {
      outcome = await createChallengeVerifier({
        siteKey: this.siteKey,
        endpoint: this.endpoint,
        ...(this.fetchImplementation === undefined
          ? {}
          : { fetch: this.fetchImplementation }),
      }).submit({
        challenge,
        trace,
        signal: abortController.signal,
      });
    } catch {
      outcome = { kind: "unavailable" };
    } finally {
      if (run === this.activeRun) {
        this.verificationAbortController = undefined;
      }
    }

    if (run !== this.activeRun || this.permanentlyDestroyed) {
      return;
    }

    const state = challengeWidgetStateForVerificationOutcome(outcome);
    renderer.setState(state);
    this.publishState(
      state,
      this.latestDecision,
      challenge,
      outcome.kind === "accepted" ||
        outcome.kind === "retry" ||
        outcome.kind === "rejected"
        ? outcome.response
        : undefined,
    );
  }

  private publishState(
    state: TraceCaptchaElementState,
    decision: DecisionResponse | undefined = this.latestDecision,
    challenge:
      | Pick<ChallengeResponse, "challengeId" | "action" | "expiresAt">
      | undefined = this.activeChallenge,
    verification: VerificationResponse | undefined = undefined,
  ): void {
    this.latestWidgetState = state;
    this.dataset.tracecaptchaState = state;
    this.updateStatusForNonRendererState(state);
    this.dispatchEvent(
      new CustomEvent<TraceCaptchaElementStateChange>(
        "tracecaptcha-statechange",
        {
          bubbles: true,
          composed: true,
          detail: {
            state,
            ...(decision === undefined ? {} : { decision }),
            ...(challenge === undefined ? {} : { challenge }),
            ...(verification === undefined ? {} : { verification }),
          },
        },
      ),
    );
  }

  private updateStatusForNonRendererState(
    state: TraceCaptchaElementState,
  ): void {
    if (this.status === undefined) {
      return;
    }

    switch (state) {
      case "idle":
        this.status.textContent = "Waiting for a verification decision.";
        break;
      case "requesting":
        this.status.textContent = "Checking whether verification is needed.";
        break;
      case "allow":
        this.status.textContent = "No drawing challenge is required.";
        break;
      case "challenge":
        this.status.textContent = "Preparing a drawing challenge.";
        break;
      case "retry":
        this.status.textContent =
          "Please follow your site's next verification step.";
        break;
      case "cooldown":
        this.status.textContent = "Please wait before trying again.";
        break;
      case "block":
        this.status.textContent = "This request cannot continue.";
        break;
      case "destroyed":
        this.status.textContent = "Verification is no longer active.";
        break;
      default:
        break;
    }
  }
}

/** Registers the element once. Call this before using <trace-captcha>. */
export function defineTraceCaptchaElement(
  name: string = traceCaptchaElementName,
): void {
  if (
    typeof customElements === "undefined" ||
    typeof HTMLElement === "undefined" ||
    name.trim().length === 0
  ) {
    throw new TraceCaptchaClientError("configuration");
  }

  if (customElements.get(name) === undefined) {
    customElements.define(name, TraceCaptchaElement);
  }
}

const componentStyles = `
  :host { color: #0f172a; display: block; font: 400 1rem/1.5 system-ui, sans-serif; }
  section { background: #fff; border: 1px solid #cbd5e1; border-radius: 0.5rem; max-width: 32rem; padding: 1rem; }
  p { margin: 0 0 0.75rem; }
  canvas { border: 1px solid #94a3b8; border-radius: 0.25rem; display: block; width: 100%; }
  button { background: #fff; border: 1px solid #475569; border-radius: 0.25rem; color: #0f172a; cursor: pointer; padding: 0.5rem 0.75rem; }
  button:focus-visible, canvas:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
`;
