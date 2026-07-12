/**
 * Typed errors thrown by core modules. API routes translate these into HTTP
 * responses via `toErrorResponse` — feature modules should throw them rather
 * than hand-rolling status codes.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to do that") {
    super(message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Invalid input") {
    super(message, 422);
  }
}

/** Serializable shape for error responses: { error: string }. */
export function toErrorResponse(error: unknown): {
  body: { error: string };
  status: number;
} {
  if (error instanceof ApiError) {
    return { body: { error: error.message }, status: error.status };
  }
  console.error("Unhandled error:", error);
  return { body: { error: "Internal server error" }, status: 500 };
}
