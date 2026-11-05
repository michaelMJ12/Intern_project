import type { D1Database } from "@cloudflare/workers-types";
import type { BillShare } from "../../shared/types";

export class PaymentsRepository {
  constructor(private readonly db: D1Database) {}

  async findShare(
    billId: string,
    shareId: string,
  ): Promise<BillShare | null> {
    return this.db
      .prepare(
        `SELECT
           s.id,
           s.bill_id,
           s.member_id,
           s.amount_cents,
           s.paid_at,
           s.idempotency_key
         FROM bill_shares s
         INNER JOIN bills b ON b.id = s.bill_id
         WHERE b.id = ?
           AND s.id = ?`,
      )
      .bind(billId, shareId)
      .first<BillShare>();
  }
  async markAsPaid(
    billId: string,
    shareId: string,
    idempotencyKey: string,
    paidAt: string,
  ): Promise<BillShare | null> {
    return this.db
      .prepare(
        `UPDATE bill_shares
         SET
           paid_at = ?,
           idempotency_key = ?
         WHERE id = ?
           AND bill_id = ?
           AND paid_at IS NULL
         RETURNING
           id,
           bill_id,
           member_id,
           amount_cents,
           paid_at,
           idempotency_key`,
      )
      .bind(paidAt, idempotencyKey, shareId, billId)
      .first<BillShare>();
  }
}
