import { tokenStorage } from "@/lib/auth/token-storage";
import {
  APIError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface RequestOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  requiresAuth?: boolean;
  isFormData?: boolean;
}

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

class ApiClient {
  private baseURL: string;
  private isRefreshing = false;
  private refreshSubscribers: QueuedRequest[] = [];

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((subscriber) => subscriber.resolve(token));
    this.refreshSubscribers = [];
  }

  private onRefreshFailed(err: Error) {
    this.refreshSubscribers.forEach((subscriber) => subscriber.reject(err));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(subscriber: QueuedRequest) {
    this.refreshSubscribers.push(subscriber);
  }

  /**
   * Main request dispatcher with token injection, error handling, and token refresh.
   */
  public async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      params,
      body,
      requiresAuth = true,
      isFormData = false,
      headers: customHeaders = {},
      ...customConfig
    } = options;

    let url = `${this.baseURL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes("?") ? "&" : "?") + queryString;
      }
    }

    const headers = new Headers(customHeaders);

    if (!isFormData && body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }

    if (requiresAuth) {
      const token = tokenStorage.getAccessToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    let requestBody: BodyInit | null = null;
    if (body) {
      if (body instanceof FormData || body instanceof URLSearchParams) {
        requestBody = body;
      } else if (typeof body === "string") {
        requestBody = body;
      } else {
        requestBody = JSON.stringify(body);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...customConfig,
        headers,
        body: requestBody,
      });
    } catch (networkErr) {
      throw new NetworkError(
        "Could not connect to the API server. Please check your network connection.",
        networkErr
      );
    }

    // Handle 401 Unauthorized with token refresh mechanism
    if (response.status === 401 && requiresAuth && !endpoint.includes("/auth/")) {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          try {
            const refreshResponse = await fetch(`${this.baseURL}/auth/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (refreshResponse.ok) {
              const data = await refreshResponse.json();
              tokenStorage.setTokens(data.access_token, data.refresh_token || refreshToken);
              this.isRefreshing = false;
              this.onRefreshed(data.access_token);
              // Retry original request
              return this.request<T>(endpoint, options);
            } else {
              const err = new UnauthorizedError("Session expired. Please sign in again.");
              this.isRefreshing = false;
              this.onRefreshFailed(err);
              tokenStorage.clearTokens();
              throw err;
            }
          } catch (err: any) {
            const authErr = new UnauthorizedError("Session expired. Please sign in again.", err);
            this.isRefreshing = false;
            this.onRefreshFailed(authErr);
            tokenStorage.clearTokens();
            throw authErr;
          }
        } else {
          // Wait for token refresh to complete
          return new Promise<T>((resolve, reject) => {
            this.addRefreshSubscriber({
              resolve: (newToken: string) => {
                const retryOptions = {
                  ...options,
                  headers: {
                    ...options.headers,
                    Authorization: `Bearer ${newToken}`,
                  },
                };
                this.request<T>(endpoint, retryOptions).then(resolve).catch(reject);
              },
              reject: (err: Error) => {
                reject(err);
              },
            });
          });
        }
      } else {
        tokenStorage.clearTokens();
        throw new UnauthorizedError("Authentication required.");
      }
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorDetail = "An unexpected error occurred.";
    let rawError: unknown = null;

    try {
      const errorJson = await response.json();
      rawError = errorJson;
      if (typeof errorJson.detail === "string") {
        errorDetail = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        // FastAPI / Pydantic validation error format
        const fieldErrors = errorJson.detail.map((err: { loc?: (string | number)[]; msg?: string }) => ({
          field: err.loc ? err.loc.slice(1).join(".") : "field",
          message: err.msg || "Invalid value",
        }));
        throw new ValidationError(
          fieldErrors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(", "),
          fieldErrors,
          rawError
        );
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        throw e;
      }
      errorDetail = response.statusText || errorDetail;
    }

    switch (response.status) {
      case 401:
        throw new UnauthorizedError(errorDetail, rawError);
      case 403:
        throw new ForbiddenError(errorDetail, rawError);
      case 404:
        throw new NotFoundError(errorDetail, rawError);
      case 409:
        throw new ConflictError(errorDetail, rawError);
      case 422:
        throw new ValidationError(errorDetail, undefined, rawError);
      case 500:
      case 502:
      case 503:
        throw new ServerError(errorDetail, rawError);
      default:
        throw new APIError(response.status, errorDetail, rawError);
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
