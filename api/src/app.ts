import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";

import { homesRoutes } from "./modules/homes/homes.routes";
import { membersRoutes } from "./modules/members/members.routes";
import { billsRoutes } from "./modules/bills/bills.routes";
import { paymentsRoutes } from "./modules/payments/payments.routes";
import { balancesRoutes } from "./modules/balances/balances.routes";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Idempotency-Key",
    ],
  }),
);

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/homes", homesRoutes);
app.route("/api/homes", membersRoutes);
app.route("/api/homes", billsRoutes);
app.route("/api/homes", balancesRoutes);

app.route("/api/bills", paymentsRoutes);

app.notFound((c) => {
  return c.json(
    {
      error: "Route not found",
    },
    404,
  );
});

app.onError(errorHandler);

export { app };
