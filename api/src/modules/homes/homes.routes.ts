import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { AppError } from "../../shared/errors";
import { HomesRepository } from "./homes.repository";
import { HomesService } from "./homes.service";
import { validateCreateHome } from "./homes.schema";
import { IdempotencyRepository, readIdempotencyKey } from "../../shared/idempotency";

const homesRoutes = new Hono<{ Bindings: Env }>();

homesRoutes.post("/", async (c) => {
  const idempotencyKey = readIdempotencyKey(
    c.req.header("Idempotency-Key"),
  );

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

  const db = getDatabase(c);

  const service = new HomesService(
    new HomesRepository(db),
    new IdempotencyRepository(db),
  );

  const home = await service.createHome(input.name, idempotencyKey);

  return c.json(
    {
      id: home.id,
      name: home.name,
    },
    201,
  );
});

export { homesRoutes };
