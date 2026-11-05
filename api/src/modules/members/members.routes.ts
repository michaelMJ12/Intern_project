import { Hono } from "hono";
import type { Env } from "../../config/env";
import { getDatabase } from "../../db/database";
import { AppError } from "../../shared/errors";
import { HomesRepository } from "../homes/homes.repository";
import { MembersRepository } from "./members.repository";
import { MembersService } from "./members.service";

const membersRoutes = new Hono<{ Bindings: Env }>();

membersRoutes.post("/:homeId/members", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !body.name.trim()
  ) {
    throw new AppError(422, "A valid member name is required");
  }

  const db = getDatabase(c);

  const service = new MembersService(
    new HomesRepository(db),
    new MembersRepository(db),
  );

  const member = await service.addMember(
    c.req.param("homeId"),
    body.name,
  );

  return c.json(
    {
      id: member.id,
      homeId: member.home_id,
      name: member.name,
    },
    201,
  );
});

export { membersRoutes };
