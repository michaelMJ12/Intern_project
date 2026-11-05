import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import type { Home } from "../../shared/types";
import { buildIdempotencyStatement, type IdempotencyContext } from "../../shared/idempotency";

export class HomesRepository {
  constructor(private readonly db: D1Database) {}

  async create(
    name: string,
    idempotency?: IdempotencyContext,
  ): Promise<Home> {
    const id = crypto.randomUUID();

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO homes (id, name)
           VALUES (?, ?)`,
        )
        .bind(id, name),
    ];

    if (idempotency) {
      statements.push(
        buildIdempotencyStatement(this.db, idempotency, id, "homes"),
      );
    }

    await this.db.batch(statements);

    const home = await this.findById(id);

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
