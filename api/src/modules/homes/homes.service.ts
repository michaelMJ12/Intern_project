import { AppError } from "../../shared/errors";
import { HomesRepository } from "./homes.repository";

export class HomesService {
  constructor(
    private readonly repository: HomesRepository,
  ) {}

  async createHome(name: string) {
    if (!name.trim()) {
      throw new AppError(422, "Home name is required");
    }

    return this.repository.create(name.trim());
  }

  async getHome(homeId: string) {
    const home = await this.repository.findById(homeId);

    if (!home) {
      throw new AppError(404, "Home not found");
    }

    return home;
  }
}
