
import type { D1Database } from "@cloudflare/workers-types";
import type { Member } from "../../shared/types";

export class MembersRepository {
  constructor(private readonly db: D1Database) {}

  async create(
    homeId: string,
    name: string,
  ): Promise<Member> {
    const id = crypto.randomUUID();

    // Calculate and assign the next position atomically.
    const result = await this.db
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
      .bind(id, homeId, name, homeId)
      .first<Member>();

    if (!result) {
      throw new Error("Failed to create member");
    }

    return result;
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
