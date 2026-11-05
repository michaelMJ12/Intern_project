import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { AppError } from "../../shared/errors";
import { BillsRepository } from "./bills.repository";
import { BillsService } from "./bills.service";
import { validateCreateBill } from "./bills.schema";
import { IdempotencyRepository, readIdempotencyKey } from "../../shared/idempotency";

const billsRoutes = new Hono<{ Bindings: Env }>();

billsRoutes.post("/:homeId/bills", async (c) => {
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
    input = validateCreateBill(body);
  } catch (error) {
    throw new AppError(
      422,
      error instanceof Error ? error.message : "Invalid bill data",
    );
  }

  const db = getDatabase(c);

  const service = new BillsService(
    new BillsRepository(db),
    new IdempotencyRepository(db),
  );

  const bill = await service.createBill(
    c.req.param("homeId"),
    input.title,
    input.totalCents,
    idempotencyKey,
  );

  return c.json(bill, 201);
});

billsRoutes.get("/:homeId/bills", async (c) => {
  const db = getDatabase(c);

  const service = new BillsService(
    new BillsRepository(db),
    new IdempotencyRepository(db),
  );

  const bills = await service.getBills(c.req.param("homeId"));

  return c.json({ bills }, 200);
});

export { billsRoutes };
