import { AppError } from "../../shared/errors";
import { hashRequest, runIdempotent, type IdempotencyRepository } from "../../shared/idempotency";
import { BillsRepository } from "./bills.repository";

export class BillsService {
  constructor(
    private readonly repository: BillsRepository,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  async createBill(
    homeId: string,
    title: string,
    totalCents: number,
    idempotencyKey?: string,
  ) {
    const home = await this.repository.findHome(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents <= 0
    ) {
      throw new AppError(
        422,
        "totalCents must be a positive whole number",
      );
    }

    const members = await this.repository.findMembers(homeId);

    if (members.length === 0) {
      throw new AppError(
        422,
        "Cannot create a bill for a home without members",
      );
    }

    if (!idempotencyKey) {
      return this.repository.createBill(
        homeId,
        title,
        totalCents,
        members,
      );
    }

    const context = {
      scope: `bills:create:${homeId}`,
      key: idempotencyKey,
      requestHash: await hashRequest({ title, totalCents }),
    };

    return runIdempotent(
      this.idempotency,
      context,
      (id) => this.repository.getBillById(homeId, id),
      () =>
        this.repository.createBill(
          homeId,
          title,
          totalCents,
          members,
          context,
        ),
    );
  }

  async getBills(homeId: string) {
    const home = await this.repository.findHome(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    return this.repository.getBillsByHome(homeId);
  }
}
