import { describe, it, expect } from "vitest";
import {
  APIError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServerError,
  NetworkError,
} from "@/lib/api/errors";

describe("API Error Hierarchy", () => {
  it("constructs UnauthorizedError with status 401", () => {
    const err = new UnauthorizedError();
    expect(err.status).toBe(401);
    expect(err.name).toBe("UnauthorizedError");
    expect(err.message).toContain("Authentication required");
  });

  it("constructs ForbiddenError with status 403", () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
    expect(err.name).toBe("ForbiddenError");
    expect(err.message).toContain("permission");
  });

  it("constructs NotFoundError with status 404", () => {
    const err = new NotFoundError("Donation not found");
    expect(err.status).toBe(404);
    expect(err.name).toBe("NotFoundError");
    expect(err.detail).toBe("Donation not found");
  });

  it("constructs ConflictError with status 409", () => {
    const err = new ConflictError("Match already accepted");
    expect(err.status).toBe(409);
    expect(err.name).toBe("ConflictError");
  });

  it("constructs ValidationError with status 422 and field errors", () => {
    const fieldErrors = [{ field: "quantity", message: "Must be positive" }];
    const err = new ValidationError("Invalid payload", fieldErrors);
    expect(err.status).toBe(422);
    expect(err.name).toBe("ValidationError");
    expect(err.errors).toEqual(fieldErrors);
  });

  it("constructs ServerError with status 500 and NetworkError with status 0", () => {
    const srvErr = new ServerError();
    expect(srvErr.status).toBe(500);

    const netErr = new NetworkError();
    expect(netErr.status).toBe(0);
  });
});
