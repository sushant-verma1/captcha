import type { ChallengeState } from "./challenge-state.js";

export const defaultChallengeLifetimeMs = 120_000;

export type RedisChallengeClient = {
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
};

export type ChallengeConsumeResult =
  | { outcome: "consumed"; challenge: ChallengeState }
  | { outcome: "expired" }
  | { outcome: "missing_or_consumed" };

export type ChallengeAbandonmentObservation =
  | { outcome: "observed"; challenge: ChallengeState }
  | { outcome: "already_observed" }
  | { outcome: "missing_or_expired" };

export class RedisChallengeStore {
  public constructor(
    private readonly client: RedisChallengeClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async save(challenge: ChallengeState): Promise<boolean> {
    if (challenge.status !== "active") {
      throw new Error("Only active challenges can be stored.");
    }

    const ttlMilliseconds =
      Date.parse(challenge.expiresAt) - this.now().getTime();

    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      return false;
    }

    const result = await this.client.set(
      challengeKey(challenge.id),
      JSON.stringify(challenge),
      { NX: true, PX: ttlMilliseconds },
    );

    return result === "OK";
  }

  public async consume(challengeId: string): Promise<ChallengeConsumeResult> {
    const serializedChallenge = await this.client.getDel(
      challengeKey(challengeId),
    );

    if (serializedChallenge === null) {
      return { outcome: "missing_or_consumed" };
    }

    const challenge = parseChallengeState(serializedChallenge);

    if (challenge === null) {
      throw new Error("Stored challenge state is invalid.");
    }

    if (Date.parse(challenge.expiresAt) <= this.now().getTime()) {
      return { outcome: "expired" };
    }

    return {
      outcome: "consumed",
      challenge: { ...challenge, status: "consumed" },
    };
  }

  /**
   * Records one best-effort lifecycle observation without consuming or changing
   * the challenge. The short-lived Redis marker deduplicates browser teardown
   * notifications; it is not retained operational telemetry.
   */
  public async observeAbandonment(
    challengeId: string,
    expected: Pick<ChallengeState, "customerId" | "siteId" | "action">,
  ): Promise<ChallengeAbandonmentObservation> {
    const serializedChallenge = await this.client.get(
      challengeKey(challengeId),
    );

    if (serializedChallenge === null) {
      return { outcome: "missing_or_expired" };
    }

    const challenge = parseChallengeState(serializedChallenge);

    if (
      challenge === null ||
      Date.parse(challenge.expiresAt) <= this.now().getTime()
    ) {
      return { outcome: "missing_or_expired" };
    }

    if (
      challenge.customerId !== expected.customerId ||
      challenge.siteId !== expected.siteId ||
      challenge.action !== expected.action
    ) {
      return { outcome: "missing_or_expired" };
    }

    const marker = await this.client.set(abandonmentKey(challengeId), "1", {
      NX: true,
      PX: Date.parse(challenge.expiresAt) - this.now().getTime(),
    });

    if (marker === null) {
      return { outcome: "already_observed" };
    }

    return { outcome: "observed", challenge };
  }
}

export function createRedisChallengeStore(
  client: RedisChallengeClient,
): RedisChallengeStore {
  return new RedisChallengeStore({
    async set(key, value, options) {
      return client.set(key, value, options);
    },
    async getDel(key) {
      return client.getDel(key);
    },
    async get(key) {
      return client.get(key);
    },
  });
}

export function createChallengeExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + defaultChallengeLifetimeMs).toISOString();
}

function challengeKey(challengeId: string): string {
  return `tracecaptcha:challenge:${challengeId}`;
}

function abandonmentKey(challengeId: string): string {
  return `tracecaptcha:challenge-abandonment:${challengeId}`;
}

function parseChallengeState(value: string): ChallengeState | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    if (
      typeof record.id !== "string" ||
      typeof record.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(record.expiresAt)) ||
      record.status !== "active"
    ) {
      return null;
    }

    return record as unknown as ChallengeState;
  } catch {
    return null;
  }
}
