import { AppError } from "../../shared/errors";
import { PaymentsRepository } from "./payments.repository";

export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
  ) {}

  async payShare(
    billId: string,
    shareId: string,
    idempotencyKey: string,
  ) {
    const share = await this.repository.findShare(
      billId,
      shareId,
    );

    if (!share) {
      throw new AppError(404, "Bill or share not found");
    }

    // A previously paid share can only be retried
    // with the original idempotency key.
    if (share.paid_at !== null) {
      if (share.idempotency_key === idempotencyKey) {
        return {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        };
      }

      throw new AppError(
        409,
        "This share has already been paid",
      );
    }

    const paidAt = new Date().toISOString();

    const updated = await this.repository.markAsPaid(
      shareId,
      idempotencyKey,
      paidAt,
    );

    if (!updated) {
      throw new AppError(404, "Share not found");
    }

    // Another request might have paid the share
    // between our initial read and conditional update.
    if (updated.idempotency_key !== idempotencyKey) {
      throw new AppError(
        409,
        "This share has already been paid",
      );
    }

    return {
      id: updated.id,
      memberId: updated.member_id,
      amountCents: updated.amount_cents,
      paidAt: updated.paid_at as string,
    };
  }
}
