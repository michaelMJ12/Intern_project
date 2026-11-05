import { AppError } from "../../shared/errors";
import { HomesRepository } from "../homes/homes.repository";
import { MembersRepository } from "./members.repository";

export class MembersService {
  constructor(
    private readonly homesRepository: HomesRepository,
    private readonly membersRepository: MembersRepository,
  ) {}

  async addMember(homeId: string, name: string) {
    const home = await this.homesRepository.findById(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    if (!name.trim()) {
      throw new AppError(422, "Member name is required");
    }

    if (name.trim().length > 120) {
      throw new AppError(
        422,
        "Member name cannot exceed 120 characters",
      );
    }

    return this.membersRepository.create(homeId, name.trim());
  }
}
