import { AppError } from "../../shared/errors";
import { hashRequest, runIdempotent, type IdempotencyRepository } from "../../shared/idempotency";
import { HomesRepository } from "./homes.repository";

export class HomesService {
  constructor(
    private readonly repository: HomesRepository,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  async createHome(name: string, idempotencyKey?: string) {
    const trimmed = name.trim();

    if (!trimmed) {
      throw new AppError(422, "Home name is required");
    }

    if (!idempotencyKey) {
      return this.repository.create(trimmed);
    }

    const context = {
      scope: "homes:create",
      key: idempotencyKey,
      requestHash: await hashRequest({ name: trimmed }),
    };

    return runIdempotent(
      this.idempotency,
      context,
      (id) => this.repository.findById(id),
      () => this.repository.create(trimmed, context),
    );
  }

  async getHome(homeId: string) {
    const home = await this.repository.findById(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    return home;
  }
}
