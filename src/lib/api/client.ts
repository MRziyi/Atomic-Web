/**
 * Lightweight typed API client.
 * Phase 1: hand-rolled fetch wrappers.
 * Phase 2: replace with openapi-fetch + auto-generated types.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

type JsonInit = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(
  method: string,
  path: string,
  init: JsonInit = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
    ...rest,
  });

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(`API ${method} ${path} ${res.status}`, res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>("GET", path, init ?? {}),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>("POST", path, { ...(init ?? {}), body }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>("PATCH", path, { ...(init ?? {}), body }),
  delete: <T>(path: string, init?: RequestInit) =>
    request<T>("DELETE", path, init ?? {}),
};
