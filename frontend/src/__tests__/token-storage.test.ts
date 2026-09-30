import { describe, it, expect, beforeEach } from "vitest";
import { tokenStorage } from "@/lib/auth/token-storage";

describe("Token Storage", () => {
  beforeEach(() => {
    tokenStorage.clearTokens();
    localStorage.clear();
  });

  it("stores and retrieves access and refresh tokens", () => {
    tokenStorage.setTokens("mock_access_token_123", "mock_refresh_token_456");
    expect(tokenStorage.getAccessToken()).toBe("mock_access_token_123");
    expect(tokenStorage.getRefreshToken()).toBe("mock_refresh_token_456");
    expect(tokenStorage.hasTokens()).toBe(true);
  });

  it("clears tokens correctly", () => {
    tokenStorage.setTokens("token_a", "token_b");
    expect(tokenStorage.hasTokens()).toBe(true);
    tokenStorage.clearTokens();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.hasTokens()).toBe(false);
  });
});
