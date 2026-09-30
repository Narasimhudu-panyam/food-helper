/**
 * Token Storage Architecture & Abstraction
 * 
 * SECURITY NOTE & PRODUCTION ARCHITECTURE:
 * 
 * In this single-page frontend application interacting with a FastAPI REST backend:
 * - The backend delivers JWT access & refresh tokens in the JSON response payload of `/auth/login` and `/auth/refresh`.
 * - For client-side storage, this module encapsulates token persistence.
 * - By default, tokens are held in-memory for the active runtime and mirrored to browser storage
 *   (localStorage/sessionStorage) to persist sessions across page reloads.
 * - In an enterprise BFF (Backend-for-Frontend) setup, tokens would ideally be converted to
 *   httpOnly SameSite=Strict cookies. As the current backend contract communicates JWT via Authorization headers,
 *   this abstraction provides a single, controlled point of access, validation, and revocation.
 */

const ACCESS_TOKEN_KEY = "food_matcher_access_token";
const REFRESH_TOKEN_KEY = "food_matcher_refresh_token";

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

class TokenManager {
  private inMemoryAccessToken: string | null = null;
  private inMemoryRefreshToken: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.inMemoryAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      this.inMemoryRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    }
  }

  public getAccessToken(): string | null {
    if (this.inMemoryAccessToken) {
      return this.inMemoryAccessToken;
    }
    if (typeof window !== "undefined") {
      this.inMemoryAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      return this.inMemoryAccessToken;
    }
    return null;
  }

  public getRefreshToken(): string | null {
    if (this.inMemoryRefreshToken) {
      return this.inMemoryRefreshToken;
    }
    if (typeof window !== "undefined") {
      this.inMemoryRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      return this.inMemoryRefreshToken;
    }
    return null;
  }

  public setTokens(accessToken: string, refreshToken: string): void {
    this.inMemoryAccessToken = accessToken;
    this.inMemoryRefreshToken = refreshToken;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } catch (err) {
        console.warn("Unable to persist auth tokens in localStorage:", err);
      }
    }
  }

  public clearTokens(): void {
    this.inMemoryAccessToken = null;
    this.inMemoryRefreshToken = null;

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      } catch (err) {
        console.warn("Unable to remove auth tokens from localStorage:", err);
      }
    }
  }

  public hasTokens(): boolean {
    return Boolean(this.getAccessToken());
  }
}

export const tokenStorage = new TokenManager();
