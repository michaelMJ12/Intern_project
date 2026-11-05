import type { ErrorHandler } from "hono";
import { AppError } from "../shared/errors";

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof AppError) {
    return c.json(
      {
        error: error.message,
      },
      error.status as 400,
    );
  }

  console.error("Unexpected API error:", error);

  return c.json(
    {
      error: "Internal server error",
    },
    500,
  );
};
