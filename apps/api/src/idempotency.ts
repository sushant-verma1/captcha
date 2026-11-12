import { createHash } from "node:crypto";

export type IdempotencyStoreClient = {
  set(
    key: string,
    value: string,
    options: { NX?: true; PX: number },
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export type IdempotencyScope = {
  customerId: string;
  siteId: string;
  endpoint: "challenge_creation";
  key: string;
  fingerprint: string;
};

export type IdempotencyResult<T> =
  | { kind: "created"; value: T }
  | { kind: "replayed"; value: T }
  | { kind: "conflict" }
  | { kind: "in_progress" };

export type IdempotencyStore = {
  execute<T>(
    scope: IdempotencyScope,
    ttlMs: number,
    operation: () => Promise<T>,
  ): Promise<IdempotencyResult<T>>;
};

export class RedisIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly client: IdempotencyStoreClient) {}

  public async execute<T>(
    scope: IdempotencyScope,
    ttlMs: number,
    operation: () => Promise<T>,
  ): Promise<IdempotencyResult<T>> {
    if (!isPositiveInteger(ttlMs) || !isScope(scope)) {
      throw new Error("Invalid idempotency operation.");
    }

    const storageKey = key(scope);
    const pending = JSON.stringify({
      fingerprint: scope.fingerprint,
      status: "pending",
    });
    const reserved = await this.client.set(storageKey, pending, {
      NX: true,
      PX: ttlMs,
    });

    if (reserved !== "OK") {
      const existing = await this.client.get(storageKey);
      const record = parseRecord(existing);
      if (record === null) {
        throw new Error("Stored idempotency state is invalid.");
      }
      if (record.fingerprint !== scope.fingerprint) {
        return { kind: "conflict" };
      }
      if (record.status === "pending") {
        return { kind: "in_progress" };
      }
      return { kind: "replayed", value: record.value as T };
    }

    let value: T;
    try {
      value = await operation();
    } catch (error) {
      await this.client.del(storageKey);
      throw error;
    }

    const completed = JSON.stringify({
      fingerprint: scope.fingerprint,
      status: "completed",
      value,
    });
    await this.client.set(storageKey, completed, { PX: ttlMs });
    return { kind: "created", value };
  }
}

export function idempotencyFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function key(scope: IdempotencyScope): string {
  const value = `${scope.customerId}:${scope.siteId}:${scope.endpoint}:${scope.key}`;
  return `tracecaptcha:idempotency:${createHash("sha256").update(value).digest("base64url")}`;
}

function isScope(value: IdempotencyScope): boolean {
  return (
    value.customerId.length > 0 &&
    value.siteId.length > 0 &&
    value.key.length > 0 &&
    value.key.length <= 255 &&
    value.fingerprint.length > 0
  );
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function parseRecord(
  value: string | null,
):
  | { fingerprint: string; status: "pending" }
  | { fingerprint: string; status: "completed"; value: unknown }
  | null {
  if (value === null) return null;
  try {
    const record: unknown = JSON.parse(value);
    if (record === null || typeof record !== "object") return null;
    const candidate = record as Record<string, unknown>;
    if (typeof candidate.fingerprint !== "string") return null;
    if (candidate.status === "pending")
      return { fingerprint: candidate.fingerprint, status: "pending" };
    if (candidate.status === "completed" && "value" in candidate) {
      return {
        fingerprint: candidate.fingerprint,
        status: "completed",
        value: candidate.value,
      };
    }
    return null;
  } catch {
    return null;
  }
}
