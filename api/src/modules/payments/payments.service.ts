import { AppError } from "../../shared/errors";
import { isUniqueConstraintError } from "../../shared/idempotency";
import type { BillShare } from "../../shared/types";
import { PaymentsRepository } from "./payments.repository";

interface PaymentResponse {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string;
}

function toPaymentResponse(share: BillShare): PaymentResponse {
  if (share.paid_at === null) {
    throw new AppError(
      409,
      "Payment is still being processed. Please try again.",
    );
  }

  return {
    id: share.id,
    memberId: share.member_id,
    amountCents: share.amount_cents,
    paidAt: share.paid_at,
  };
}

export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
  ) {}

  async payShare(
    billId: string,
    shareId: string,
    idempotencyKey: string,
  ): Promise<PaymentResponse> {
    const share = await this.repository.findShare(billId, shareId);

    if (!share) {
      throw new AppError(404, "Bill or share not found");
    }

    if (share.paid_at !== null) {
      return this.replayOrReject(share, idempotencyKey);
    }

    let updated: BillShare | null;

    try {
      updated = await this.repository.markAsPaid(
        billId,
        shareId,
        idempotencyKey,
        new Date().toISOString(),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          422,
          "Idempotency-Key was already used for a different payment",
        );
      }

      throw error;
    }

    if (updated) {
      return toPaymentResponse(updated);
    }
    const current = await this.repository.findShare(billId, shareId);

    if (!current) {
      throw new AppError(404, "Bill or share not found");
    }

    return this.replayOrReject(current, idempotencyKey);
  }

  private replayOrReject(
    share: BillShare,
    idempotencyKey: string,
  ): PaymentResponse {
    if (share.idempotency_key === idempotencyKey) {
      return toPaymentResponse(share);
    }

    throw new AppError(409, "This share has already been paid");
  }
}
