export interface CreateHomeInput {
  name: string;
}

export function validateCreateHome(
  body: unknown,
): CreateHomeInput {
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body)
  ) {
    throw new Error("Home name is required");
  }

  const name = body.name;

  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Home name must be a non-empty string");
  }

  if (name.trim().length > 120) {
    throw new Error("Home name cannot exceed 120 characters");
  }

  return {
    name: name.trim(),
  };
}
