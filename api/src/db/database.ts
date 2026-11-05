import type { Context } from "hono";
import type { Env } from "../config/env";

export function getDatabase(c: Context<{ Bindings: Env }>) {
  return c.env.DB;
}
