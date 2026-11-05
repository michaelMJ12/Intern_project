import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { AppError } from "../../shared/errors";
import { PaymentsRepository } from "./payments.repository";
import { PaymentsService } from "./payments.service";
import { readIdempotencyKey } from "../../shared/idempotency";

const paymentsRoutes = new Hono<{ Bindings: Env }>();

paymentsRoutes.post(
  "/:billId/shares/:shareId/pay",
  async (c) => {
    const idempotencyKey = readIdempotencyKey(
      c.req.header("Idempotency-Key"),
    );

    if (!idempotencyKey) {
      throw new AppError(
        400,
        "Idempotency-Key header is required",
      );
    }

    const service = new PaymentsService(
      new PaymentsRepository(getDatabase(c)),
    );

    const payment = await service.payShare(
      c.req.param("billId"),
      c.req.param("shareId"),
      idempotencyKey,
    );

    return c.json(payment, 200);
  },
);

export { paymentsRoutes };
