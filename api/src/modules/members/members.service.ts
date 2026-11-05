import { AppError } from "../../shared/errors";
import { hashRequest, runIdempotent, type IdempotencyRepository } from "../../shared/idempotency";
import { HomesRepository } from "../homes/homes.repository";
import { MembersRepository } from "./members.repository";

export class MembersService {
  constructor(
    private readonly homesRepository: HomesRepository,
    private readonly membersRepository: MembersRepository,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  async addMember(
    homeId: string,
    name: string,
    idempotencyKey?: string,
  ) {
    const home = await this.homesRepository.findById(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    const trimmed = name.trim();

    if (!trimmed) {
      throw new AppError(422, "Member name is required");
    }

    if (trimmed.length > 120) {
      throw new AppError(
        422,
        "Member name cannot exceed 120 characters",
      );
    }

    if (!idempotencyKey) {
      return this.membersRepository.create(homeId, trimmed);
    }

    const context = {
      scope: `members:create:${homeId}`,
      key: idempotencyKey,
      requestHash: await hashRequest({ name: trimmed }),
    };

    return runIdempotent(
      this.idempotency,
      context,
      (id) => this.membersRepository.findById(id),
      () => this.membersRepository.create(homeId, trimmed, context),
    );
  }
}
