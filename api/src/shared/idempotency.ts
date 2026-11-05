import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { AppError } from "./errors";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export type IdempotentResourceTable = "homes" | "members" | "bills";

export interface IdempotencyContext {
  scope: string;
  key: string;
  requestHash: string;
}

interface IdempotencyRecord {
  request_hash: string;
  resource_id: string;
}

export function readIdempotencyKey(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const key = raw.trim();

  if (!key) {
    throw new AppError(400, "Idempotency-Key header cannot be empty");
  }

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new AppError(400, "Idempotency-Key is too long");
  }

  return key;
}

export async function hashRequest(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isUniqueConstraintError(error: unknown): boolean {
  const pattern = /UNIQUE constraint failed|SQLITE_CONSTRAINT/i;

  if (!(error instanceof Error)) {
    return false;
  }

  if (pattern.test(error.message)) {
    return true;
  }

  const cause: unknown = error.cause;
  return cause instanceof Error && pattern.test(cause.message);
}

export class IdempotencyRepository {
  constructor(private readonly db: D1Database) {}

  async find(
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    return this.db
      .prepare(
        `SELECT request_hash, resource_id
         FROM idempotency_keys
         WHERE scope = ? AND idempotency_key = ?`,
      )
      .bind(scope, key)
      .first<IdempotencyRecord>();
  }
}
export function buildIdempotencyStatement(
  db: D1Database,
  context: IdempotencyContext,
  resourceId: string,
  table: IdempotentResourceTable,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO idempotency_keys (
         scope,
         idempotency_key,
         request_hash,
         resource_id
       )
       SELECT ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
    )
    .bind(
      context.scope,
      context.key,
      context.requestHash,
      resourceId,
      resourceId,
    );
}

async function findReplayId(
  repository: IdempotencyRepository,
  context: IdempotencyContext,
): Promise<string | null> {
  const record = await repository.find(context.scope, context.key);

  if (!record) {
    return null;
  }

  if (record.request_hash !== context.requestHash) {
    throw new AppError(
      422,
      "Idempotency-Key was already used with a different request",
    );
  }

  return record.resource_id;
}
export async function runIdempotent<T>(
  repository: IdempotencyRepository,
  context: IdempotencyContext,
  loadExisting: (resourceId: string) => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existingId = await findReplayId(repository, context);

  if (existingId) {
    const existing = await loadExisting(existingId);

    if (existing) {
      return existing;
    }
  }

  try {
    return await create();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const racedId = await findReplayId(repository, context);

      if (racedId) {
        const existing = await loadExisting(racedId);

        if (existing) {
          return existing;
        }
      }
    }

    throw error;
  }
}
