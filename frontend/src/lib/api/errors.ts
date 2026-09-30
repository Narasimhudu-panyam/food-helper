/**
 * Typed API Error hierarchy for standard frontend error handling.
 */

export class APIError extends Error {
  public readonly status: number;
  public readonly detail: string;
  public readonly rawError?: unknown;

  constructor(status: number, detail: string, rawError?: unknown) {
    super(detail);
    this.name = "APIError";
    this.status = status;
    this.detail = detail;
    this.rawError = rawError;
  }
}

export class UnauthorizedError extends APIError {
  constructor(detail = "Authentication required or session has expired.", rawError?: unknown) {
    super(401, detail, rawError);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends APIError {
  constructor(detail = "You do not have permission to perform this action.", rawError?: unknown) {
    super(403, detail, rawError);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends APIError {
  constructor(detail = "The requested resource was not found.", rawError?: unknown) {
    super(404, detail, rawError);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends APIError {
  constructor(detail = "The operation conflicted with existing resource state.", rawError?: unknown) {
    super(409, detail, rawError);
    this.name = "ConflictError";
  }
}

export class ValidationError extends APIError {
  public readonly errors?: Array<{ field: string; message: string }>;

  constructor(
    detail = "Validation failed. Please verify your input.",
    errors?: Array<{ field: string; message: string }>,
    rawError?: unknown
  ) {
    super(422, detail, rawError);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export class ServerError extends APIError {
  constructor(detail = "An internal server error occurred. Please try again later.", rawError?: unknown) {
    super(500, detail, rawError);
    this.name = "ServerError";
  }
}

export class NetworkError extends APIError {
  constructor(detail = "Unable to connect to the server. Please check your network connection.", rawError?: unknown) {
    super(0, detail, rawError);
    this.name = "NetworkError";
  }
}
