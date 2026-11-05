import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { BalancesService } from "./balances.service";

const balancesRoutes = new Hono<{ Bindings: Env }>();

balancesRoutes.get("/:homeId/balances", async (c) => {
  const service = new BalancesService(getDatabase(c));

  const balances = await service.getBalances(
    c.req.param("homeId"),
  );

  return c.json({ balances }, 200);
});

export { balancesRoutes };
