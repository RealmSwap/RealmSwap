/**
 * Tiny cookie-jar HTTP client for the API e2e harness. Sessions ride exactly
 * like they do for a real browser: Set-Cookie headers from /api/auth/* are
 * captured and replayed, so the Supabase ssr cookie flow (including rotation)
 * is exercised for real.
 */

export interface ApiResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  body: any;
  text: string;
}

export class ApiClient {
  private cookies = new Map<string, string>();

  constructor(public baseUrl: string) {}

  clearCookies() {
    this.cookies.clear();
  }

  private captureCookies(headers: Headers) {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // Expired/max-age=0 cookies delete.
      if (value === "" || /max-age=0/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries()).map(([n, v]) => `${n}=${v}`).join("; ");
  }

  /** Current cookie header — for raw fetch calls that stream (SSE) or need manual aborts. */
  cookie(): string {
    return this.cookieHeader();
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    opts: { headers?: Record<string, string>; raw?: boolean } = {}
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });

    this.captureCookies(res.headers);
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null; // HTML/SSE/empty bodies stay as text
    }
    return { status: res.status, ok: res.ok, headers: res.headers, body: parsed, text };
  }

  get(path: string, opts?: { headers?: Record<string, string> }) {
    return this.request("GET", path, undefined, opts);
  }
  post(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("POST", path, body, opts);
  }
  put(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("PUT", path, body, opts);
  }
  patch(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("PATCH", path, body, opts);
  }
  delete(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("DELETE", path, body, opts);
  }
}

/** Assert helper: throws a readable error when the condition fails. */
export function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
