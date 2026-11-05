import type { D1Database } from "@cloudflare/workers-types";
import type {
  Bill,
  BillResponse,
  Member,
} from "../../shared/types";

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
  ): Promise<BillResponse> {
    const billId = crypto.randomUUID();

    const baseAmount = Math.floor(
      totalCents / members.length,
    );

    const remainder = totalCents % members.length;

    const statements = [
      this.db
        .prepare(
          `INSERT INTO bills (
             id,
             home_id,
             title,
             total_cents
           )
           VALUES (?, ?, ?, ?)`,
        )
        .bind(billId, homeId, title, totalCents),

      ...members.map((member, index) => {
        const amountCents =
          baseAmount + (index < remainder ? 1 : 0);

        return this.db
          .prepare(
            `INSERT INTO bill_shares (
               id,
               bill_id,
               member_id,
               amount_cents
             )
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            billId,
            member.id,
            amountCents,
          );
      }),
    ];

    // D1 batch executes the statements atomically.
    await this.db.batch(statements);

    const createdBill = await this.getBillById(
      homeId,
      billId,
    );

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
           s.member_id,
           s.amount_cents,
           s.paid_at
         FROM bill_shares s
         JOIN members m ON m.id = s.member_id
         WHERE s.bill_id = ?
         ORDER BY m.position ASC`,
      )
      .bind(billId)
      .all<{
        id: string;
        member_id: string;
        amount_cents: number;
        paid_at: string | null;
      }>();

    return {
      id: bill.id,
      homeId: bill.home_id,
      title: bill.title,
      totalCents: bill.total_cents,
      shares: shares.results.map((share) => ({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })),
    };
  }

  async getBillsByHome(
    homeId: string,
  ): Promise<BillResponse[]> {
    const bills = await this.db
      .prepare(
        `SELECT id, home_id, title, total_cents
         FROM bills
         WHERE home_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(homeId)
      .all<Bill>();

    const responses: BillResponse[] = [];

    for (const bill of bills.results) {
      const shares = await this.db
        .prepare(
          `SELECT
             s.id,
             s.member_id,
             s.amount_cents,
             s.paid_at
           FROM bill_shares s
           JOIN members m ON m.id = s.member_id
           WHERE s.bill_id = ?
           ORDER BY m.position ASC`,
        )
        .bind(bill.id)
        .all<{
          id: string;
          member_id: string;
          amount_cents: number;
          paid_at: string | null;
        }>();

      responses.push({
        id: bill.id,
        homeId: bill.home_id,
        title: bill.title,
        totalCents: bill.total_cents,
        shares: shares.results.map((share) => ({
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        })),
      });
    }

    return responses;
  }
}
