import type { D1Database } from "@cloudflare/workers-types";
import { AppError } from "../../shared/errors";
import type { Balance } from "../../shared/types";

export class BalancesService {
  constructor(private readonly db: D1Database) {}

  async getBalances(homeId: string): Promise<Balance[]> {
    const home = await this.db
      .prepare("SELECT id FROM homes WHERE id = ?")
      .bind(homeId)
      .first<{ id: string }>();

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    const result = await this.db
      .prepare(
        `SELECT
           m.id AS member_id,
           m.name AS member_name,
           COALESCE(
             SUM(
               CASE
                 WHEN s.paid_at IS NULL
                 THEN s.amount_cents
                 ELSE 0
               END
             ),
             0
           ) AS outstanding_cents
         FROM members m
         LEFT JOIN bill_shares s
           ON s.member_id = m.id
         WHERE m.home_id = ?
         GROUP BY m.id, m.name, m.position
         ORDER BY m.position ASC`,
      )
      .bind(homeId)
      .all<{
        member_id: string;
        member_name: string;
        outstanding_cents: number;
      }>();

    return result.results.map((row) => ({
      memberId: row.member_id,
      name: row.member_name,
      outstandingCents: row.outstanding_cents,
    }));
  }
}
