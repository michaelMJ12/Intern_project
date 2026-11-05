import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { AppError } from "../../shared/errors";

import type {
  Bill,
  BillResponse,
  Member,
} from "../../shared/types";
import { buildIdempotencyStatement, type IdempotencyContext } from "../../shared/idempotency";

interface ShareRow {
  id: string;
  bill_id: string;
  member_id: string;
  amount_cents: number;
  paid_at: string | null;
}

function toBillResponse(bill: Bill, shares: ShareRow[]): BillResponse {
  return {
    id: bill.id,
    homeId: bill.home_id,
    title: bill.title,
    totalCents: bill.total_cents,
    shares: shares.map((share) => ({
      id: share.id,
      memberId: share.member_id,
      amountCents: share.amount_cents,
      paidAt: share.paid_at,
    })),
  };
}

export class BillsRepository {
  constructor(private readonly db: D1Database) {}

  async findHome(homeId: string) {
    return this.db
      .prepare("SELECT id FROM homes WHERE id = ?")
      .bind(homeId)
      .first<{ id: string }>();
  }

  async findMembers(homeId: string): Promise<Member[]> {
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

  async createBill(
    homeId: string,
    title: string,
    totalCents: number,
    members: Member[],
    idempotency?: IdempotencyContext,
  ): Promise<BillResponse> {
    if (members.length === 0) {
      throw new AppError(
        422,
        "Cannot create a bill for a home without members",
      );
    }

    const billId = crypto.randomUUID();

    const baseAmount = Math.floor(totalCents / members.length);
    const remainder = totalCents % members.length;

    const allocations = members.map((member, index) => ({
      memberId: member.id,
      amountCents: baseAmount + (index < remainder ? 1 : 0),
    }));

    const allocated = allocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0,
    );

    if (allocated !== totalCents) {
      throw new Error("Share allocation does not match the bill total");
    }

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO bills (
             id,
             home_id,
             title,
             total_cents
           )
           SELECT ?, ?, ?, ?
           WHERE (
             SELECT COUNT(*) FROM members WHERE home_id = ?
           ) = ?`,
        )
        .bind(
          billId,
          homeId,
          title,
          totalCents,
          homeId,
          members.length,
        ),

      ...allocations.map((allocation) =>
        this.db
          .prepare(
            `INSERT INTO bill_shares (
               id,
               bill_id,
               member_id,
               amount_cents
             )
             SELECT ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM bills WHERE id = ?)`,
          )
          .bind(
            crypto.randomUUID(),
            billId,
            allocation.memberId,
            allocation.amountCents,
            billId,
          ),
      ),
    ];

    if (idempotency) {
      statements.push(
        buildIdempotencyStatement(
          this.db,
          idempotency,
          billId,
          "bills",
        ),
      );
    }

    const results = await this.db.batch(statements);

    if ((results[0]?.meta.changes ?? 0) !== 1) {
      throw new AppError(
        409,
        "Household members changed while the bill was being created. Please try again.",
      );
    }

    const createdBill = await this.getBillById(homeId, billId);

    if (!createdBill) {
      throw new Error("Failed to retrieve created bill");
    }

    return createdBill;
  }

  async getBillById(
    homeId: string,
    billId: string,
  ): Promise<BillResponse | null> {
    const bill = await this.db
      .prepare(
        `SELECT id, home_id, title, total_cents
         FROM bills
         WHERE id = ? AND home_id = ?`,
      )
      .bind(billId, homeId)
      .first<Bill>();

    if (!bill) {
      return null;
    }

    const shares = await this.db
      .prepare(
        `SELECT
           s.id,
           s.bill_id,
           s.member_id,
           s.amount_cents,
           s.paid_at
         FROM bill_shares s
         JOIN members m ON m.id = s.member_id
         WHERE s.bill_id = ?
         ORDER BY m.position ASC`,
      )
      .bind(billId)
      .all<ShareRow>();

    return toBillResponse(bill, shares.results);
  }

  async getBillsByHome(homeId: string): Promise<BillResponse[]> {
    const bills = await this.db
      .prepare(
        `SELECT id, home_id, title, total_cents
         FROM bills
         WHERE home_id = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .bind(homeId)
      .all<Bill>();
    const shares = await this.db
      .prepare(
        `SELECT
           s.id,
           s.bill_id,
           s.member_id,
           s.amount_cents,
           s.paid_at
         FROM bill_shares s
         JOIN bills b ON b.id = s.bill_id
         JOIN members m ON m.id = s.member_id
         WHERE b.home_id = ?
         ORDER BY m.position ASC`,
      )
      .bind(homeId)
      .all<ShareRow>();

    const sharesByBill = new Map<string, ShareRow[]>();

    for (const share of shares.results) {
      const group = sharesByBill.get(share.bill_id);

      if (group) {
        group.push(share);
      } else {
        sharesByBill.set(share.bill_id, [share]);
      }
    }

    return bills.results.map((bill) =>
      toBillResponse(bill, sharesByBill.get(bill.id) ?? []),
    );
  }
}
