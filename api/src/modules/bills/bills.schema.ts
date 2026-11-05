export interface CreateBillInput {
  title: string;
  totalCents: number;
}

export function validateCreateBill(
  body: unknown,
): CreateBillInput {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }

  if (!("title" in body) || typeof body.title !== "string") {
    throw new Error("Bill title is required");
  }

  if (!body.title.trim()) {
    throw new Error("Bill title cannot be empty");
  }

  if (body.title.trim().length > 150) {
    throw new Error("Bill title cannot exceed 150 characters");
  }

  if (
    !("totalCents" in body) ||
    typeof body.totalCents !== "number" ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    throw new Error(
      "totalCents must be a positive whole number",
    );
  }

  return {
    title: body.title.trim(),
    totalCents: body.totalCents,
  };
}
