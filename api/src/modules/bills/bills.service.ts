import { AppError } from "../../shared/errors";
import { BillsRepository } from "./bills.repository";

export class BillsService {
  constructor(
    private readonly repository: BillsRepository,
  ) {}

  async createBill(
    homeId: string,
    title: string,
    totalCents: number,
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

    const members =
      await this.repository.findMembers(homeId);

    if (members.length === 0) {
      throw new AppError(
        422,
        "Cannot create a bill for a home without members",
      );
    }

    return this.repository.createBill(
      homeId,
      title,
      totalCents,
      members,
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
