/**
 * Single client-side fetch wrapper. Every dashboard view should go through
 * this so API failures always surface as a readable message — never
 * `[object Object]`, a raw status code, or a silent catch.
 */

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** JSON body — serialized for you; sets Content-Type automatically. */
  json?: unknown;
}

export async function apiFetch<T = any>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const { json, ...rest } = options;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...rest,
      ...(json !== undefined
        ? {
            headers: { "Content-Type": "application/json", ...(rest.headers || {}) },
            body: JSON.stringify(json),
          }
        : {}),
    });
  } catch {
    throw new ApiError("Can't reach the RealmSwap server — check that the app is still running.", 0);
  }

  const text = await res.text().catch(() => "");
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && typeof body.error === "string" && body.error) ||
      (typeof body === "string" && body) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }

  return (body ?? {}) as T;
}
