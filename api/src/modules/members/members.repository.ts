import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import type { Member } from "../../shared/types";
import { buildIdempotencyStatement, type IdempotencyContext } from "../../shared/idempotency";

export class MembersRepository {
  constructor(private readonly db: D1Database) {}

  async create(
    homeId: string,
    name: string,
    idempotency?: IdempotencyContext,
  ): Promise<Member> {
    const id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO members (
             id,
             home_id,
             name,
             position
           )
           SELECT
             ?,
             ?,
             ?,
             COALESCE(MAX(position), 0) + 1
           FROM members
           WHERE home_id = ?
           RETURNING id, home_id, name, position, created_at`,
        )
        .bind(id, homeId, name, homeId),
    ];

    if (idempotency) {
      statements.push(
        buildIdempotencyStatement(this.db, idempotency, id, "members"),
      );
    }
    const results = await this.db.batch<Member>(statements);
    const member = results[0]?.results[0];

    if (!member) {
      throw new Error("Failed to create member");
    }

    return member;
  }

  async findById(id: string): Promise<Member | null> {
    return this.db
      .prepare(
        `SELECT id, home_id, name, position, created_at
         FROM members
         WHERE id = ?`,
      )
      .bind(id)
      .first<Member>();
  }

  async findByHomeId(homeId: string): Promise<Member[]> {
    const result = await this.db
      .prepare(
        `SELECT id, home_id, name, position, created_at
         FROM members
         WHERE home_id = ?
         ORDER BY position ASC`,
      )
      .bind(homeId)
      .all<Member>();

    return result.results;
  }
}
