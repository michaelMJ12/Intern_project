import type { D1Database } from "@cloudflare/workers-types";
import type { Home } from "../../shared/types";

export class HomesRepository {
  constructor(private readonly db: D1Database) {}

  async create(name: string): Promise<Home> {
    const id = crypto.randomUUID();

    await this.db
      .prepare(
        `INSERT INTO homes (id, name)
         VALUES (?, ?)`,
      )
      .bind(id, name)
      .run();

    const home = await this.db
      .prepare(
        `SELECT id, name, created_at
         FROM homes
         WHERE id = ?`,
      )
      .bind(id)
      .first<Home>();

    if (!home) {
      throw new Error("Failed to create home");
    }

    return home;
  }

  async findById(id: string): Promise<Home | null> {
    return this.db
      .prepare(
        `SELECT id, name, created_at
         FROM homes
         WHERE id = ?`,
      )
      .bind(id)
      .first<Home>();
  }
}
