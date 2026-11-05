import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { AppError } from "../../shared/errors";
import { HomesRepository } from "./homes.repository";
import { HomesService } from "./homes.service";
import { validateCreateHome } from "./homes.schema";

const homesRoutes = new Hono<{ Bindings: Env }>();

homesRoutes.post("/", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "Invalid JSON body");
  }

  let input;

  try {
    input = validateCreateHome(body);
  } catch (error) {
    throw new AppError(
      422,
      error instanceof Error ? error.message : "Invalid home data",
    );
  }

  const service = new HomesService(
    new HomesRepository(getDatabase(c)),
  );

  const home = await service.createHome(input.name);

  return c.json(
    {
      id: home.id,
      name: home.name,
    },
    201,
  );
});

export { homesRoutes };
