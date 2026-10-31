/**
 * Minimal fake Supabase Auth for the API e2e harness.
 *
 * Implements just enough of the GoTrue HTTP surface for the app's auth flows:
 * password sign-in, signup (auto-confirm), user read/update, logout, password
 * recovery, and permissive /rest/v1/* answers for PostgREST reads (entitlement
 * mirrors resolve to "no cloud rows" = free plan).
 *
 * Access tokens are real HS256 JWTs signed with SUPABASE_JWT_SECRET, so the
 * app's offline local verification path (verifySupabaseTokenLocal) accepts
 * them exactly like tokens from a real project. Bad passwords are rejected —
 * the app's 401 path stays covered.
 */

import http from "http";
import jwt from "jsonwebtoken";
import { SUPABASE_JWT_SECRET, FAKE_SUPABASE_PORT, FAKE_SUPABASE_URL } from "./config";

interface FakeUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

export class FakeSupabase {
  private users = new Map<string, FakeUser>(); // by email
  private server: http.Server | null = null;

  addUser(user: FakeUser) {
    this.users.set(user.email.toLowerCase(), user);
  }

  /** Register (signUp). Returns an error string on email collision. */
  signUp(email: string, password: string, name: string): string | null {
    const key = email.toLowerCase();
    if (this.users.has(key)) return "User already registered";
    this.users.set(key, { id: randomId(), email: key, password, name });
    return null;
  }

  signIn(email: string, password: string): FakeUser | null {
    const user = this.users.get(email.toLowerCase());
    if (!user || user.password !== password) return null;
    return user;
  }

  userById(id: string): FakeUser | null {
    for (const user of Array.from(this.users.values())) if (user.id === id) return user;
    return null;
  }

  updatePassword(id: string, password: string) {
    const user = this.userById(id);
    if (user) user.password = password;
  }

  sessionFor(user: FakeUser) {
    const expiresIn = 60 * 60 * 24 * 365; // far future — no refresh round-trips
    const now = Math.floor(Date.now() / 1000);
    const access_token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: "authenticated",
        aud: "authenticated",
        user_metadata: { full_name: user.name },
        app_metadata: { provider: "email", providers: ["email"] },
      },
      SUPABASE_JWT_SECRET,
      { algorithm: "HS256", expiresIn }
    );
    return {
      access_token,
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: now + expiresIn,
      refresh_token: `e2e-refresh-${user.id.slice(0, 8)}`,
      user: this.publicUser(user),
    };
  }

  private publicUser(user: FakeUser) {
    return {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: user.name },
    };
  }

  start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    return new Promise((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(FAKE_SUPABASE_PORT, "127.0.0.1", () => resolve());
    });
  }

  stop(): Promise<void> {
    if (!this.server) return Promise.resolve();
    return new Promise((resolve) => this.server!.close(() => resolve()));
  }

  private send(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private async readBody(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return {};
    }
  }

  private bearer(req: http.IncomingMessage): string | null {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const url = new URL(req.url || "/", FAKE_SUPABASE_URL);
      const p = url.pathname;

      // PostgREST: entitlement mirror reads resolve to "no rows" (free plan).
      if (p.startsWith("/rest/v1/")) {
        this.send(res, 200, []);
        return;
      }

      if (p === "/auth/v1/token" && req.method === "POST") {
        const body = await this.readBody(req);
        const grant = body.grant_type || "password";
        if (grant === "refresh_token") {
          const user = this.userById(String(body.refresh_token || "").replace("e2e-refresh-", "")) ||
            Array.from(this.users.values()).find((u) => body.refresh_token === `e2e-refresh-${u.id.slice(0, 8)}`) || null;
          if (!user) return this.send(res, 400, { error: "invalid_grant", error_description: "Invalid refresh token" });
          return this.send(res, 200, this.sessionFor(user));
        }
        const user = this.signIn(String(body.email || ""), String(body.password || ""));
        if (!user) {
          return this.send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        }
        return this.send(res, 200, this.sessionFor(user));
      }

      if (p === "/auth/v1/signup" && req.method === "POST") {
        const body = await this.readBody(req);
        const err = this.signUp(String(body.email || ""), String(body.password || ""), String((body.data || {}).full_name || "Player"));
        if (err) return this.send(res, 400, { error: "user_already_exists", msg: err });
        const user = this.signIn(String(body.email || ""), String(body.password || ""));
        return this.send(res, 200, this.sessionFor(user!));
      }

      if (p === "/auth/v1/user" && req.method === "GET") {
        const token = this.bearer(req);
        const payload = this.verify(token);
        if (!payload) return this.send(res, 401, { error: "invalid_claim", error_description: "Invalid token" });
        const user = this.userById(String(payload.sub));
        if (!user) return this.send(res, 404, { error: "not_found" });
        return this.send(res, 200, this.publicUser(user));
      }

      if (p === "/auth/v1/user" && req.method === "PUT") {
        const token = this.bearer(req);
        const payload = this.verify(token);
        if (!payload) return this.send(res, 401, { error: "invalid_claim", error_description: "Invalid token" });
        const body = await this.readBody(req);
        if (typeof body.password === "string") this.updatePassword(String(payload.sub), body.password);
        const user = this.userById(String(payload.sub));
        if (!user) return this.send(res, 404, { error: "not_found" });
        return this.send(res, 200, this.publicUser(user));
      }

      if (p === "/auth/v1/logout" && req.method === "POST") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (p === "/auth/v1/recover" && req.method === "POST") {
        return this.send(res, 200, {});
      }

      this.send(res, 404, { error: "not_found", path: p });
    } catch (err: any) {
      this.send(res, 500, { error: "fake_supabase_error", message: err.message });
    }
  }

  private verify(token: string | null): Record<string, unknown> | null {
    if (!token) return null;
    try {
      return jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function randomId(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 32; i++) id += hex[Math.floor(Math.random() * 16)];
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
}
