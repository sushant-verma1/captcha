import type { ChallengeState } from "./challenge-state.js";

export const defaultChallengeLifetimeMs = 120_000;

export type RedisChallengeClient = {
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
};

export type ChallengeConsumeResult =
  | { outcome: "consumed"; challenge: ChallengeState }
  | { outcome: "expired" }
  | { outcome: "missing_or_consumed" };

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
  });
}

export function createChallengeExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + defaultChallengeLifetimeMs).toISOString();
}

function challengeKey(challengeId: string): string {
  return `tracecaptcha:challenge:${challengeId}`;
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
