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

// --- In-memory marketplace tables (PostgREST surface used by /api/marketplace/*) ---
// The marketplace routes talk to cloud Supabase through supabase-js (PostgREST
// shape: table selects with eq/contains/or filters, inserts, rpc calls). The
// fake implements just enough of that wire format for the marketplace/realms
// scenario to drive a real publish → favorite → deploy round-trip.

interface FakeRealm {
  id: string;
  seller_id: string;
  name: string;
  description: string;
  game_slug: string;
  tags: string[];
  payload: unknown;
  custom_def_spec: unknown;
  version: string;
  status: string;
  visibility: string;
  verified_level: string;
  download_count: number;
  like_count: number;
  created_at: string;
}

interface FakeRealmVersion {
  id: string;
  realm_id: string;
  version: string;
  payload: unknown;
  custom_def_spec: unknown;
  changelog: string | null;
  created_at: string;
}

interface FakeRealmVote {
  realm_id: string;
  user_id: string;
  value: number;
}

export class FakeSupabase {
  private users = new Map<string, FakeUser>(); // by email
  private realms: FakeRealm[] = [];
  private realmVersions: FakeRealmVersion[] = [];
  private realmVotes: FakeRealmVote[] = [];
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

      // PostgREST: entitlement mirror reads resolve to "no rows" (free plan);
      // the marketplace tables get a real in-memory implementation so the
      // publish → favorite → deploy round-trip can be driven for real.
      if (p.startsWith("/rest/v1/")) {
        const restPath = p.slice("/rest/v1/".length);
        const callerId = this.callerId(req);
        if (restPath === "realms") {
          if (req.method === "GET") return this.send(res, 200, this.queryRealms(url.searchParams, callerId));
          if (req.method === "POST") {
            const body = await this.readBody(req);
            const row: FakeRealm = {
              id: randomId(),
              seller_id: callerId ?? "",
              name: String(body.name ?? ""),
              description: String(body.description ?? ""),
              game_slug: String(body.game_slug ?? ""),
              tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
              payload: body.payload ?? {},
              custom_def_spec: body.custom_def_spec ?? null,
              version: String(body.version ?? "1.0.0"),
              status: String(body.status ?? "PUBLISHED"),
              visibility: String(body.visibility ?? "PUBLIC"),
              verified_level: String(body.verified_level ?? "UNVERIFIED"),
              download_count: 0,
              like_count: 0,
              created_at: new Date().toISOString(),
            };
            this.realms.push(row);
            const prefer = String(req.headers.prefer || "");
            if (prefer.includes("return=representation")) {
              const projected = this.selectRealmFields(row, String(url.searchParams.get("select") || ""), callerId);
              // .single() asks for the object media type; PostgREST answers with
              // the row itself, not an array.
              if (String(req.headers.accept || "").includes("vnd.pgrst.object")) {
                return this.send(res, 201, projected);
              }
              return this.send(res, 201, [projected]);
            }
            return this.send(res, 201, []);
          }
        }
        if (restPath === "realm_versions" && req.method === "GET") {
          const realmId = this.eqParam(url.searchParams, "realm_id");
          const rows = this.realmVersions
            .filter((v) => !realmId || v.realm_id === realmId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((v) => this.selectFields(v as unknown as Record<string, unknown>, String(url.searchParams.get("select") || "")));
          return this.send(res, 200, rows);
        }
        if (restPath === "realm_versions" && req.method === "POST") {
          const body = await this.readBody(req);
          this.realmVersions.push({
            id: randomId(),
            realm_id: String(body.realm_id ?? ""),
            version: String(body.version ?? "1.0.0"),
            payload: body.payload ?? {},
            custom_def_spec: body.custom_def_spec ?? null,
            changelog: body.changelog ?? null,
            created_at: new Date().toISOString(),
          });
          return this.send(res, 201, []);
        }
        if (restPath === "realm_votes") {
          if (req.method === "POST") {
            const body = await this.readBody(req);
            const existing = this.realmVotes.find(
              (v) => v.realm_id === body.realm_id && v.user_id === body.user_id
            );
            if (existing) existing.value = Number(body.value ?? 1);
            else this.realmVotes.push({ realm_id: String(body.realm_id), user_id: String(body.user_id), value: Number(body.value ?? 1) });
            const realm = this.realms.find((r) => r.id === body.realm_id);
            if (realm) realm.like_count = this.realmVotes.filter((v) => v.realm_id === realm.id).length;
            return this.send(res, 201, []);
          }
          if (req.method === "DELETE") {
            const realmId = this.eqParam(url.searchParams, "realm_id");
            const userId = this.eqParam(url.searchParams, "user_id");
            this.realmVotes = this.realmVotes.filter((v) => !(v.realm_id === realmId && v.user_id === userId));
            const realm = this.realms.find((r) => r.id === realmId);
            if (realm) realm.like_count = this.realmVotes.filter((v) => v.realm_id === realm.id).length;
            res.writeHead(204);
            res.end();
            return;
          }
        }
        if (restPath.startsWith("rpc/")) {
          const fn = restPath.slice("rpc/".length);
          const body = await this.readBody(req);
          if (fn === "publish_realm_version") {
            const realm = this.realms.find((r) => r.id === body.p_realm_id);
            if (!realm) return this.send(res, 400, { message: "Realm not found", details: null, hint: null, code: "PGRST" });
            if (realm.seller_id !== callerId) {
              return this.send(res, 400, { message: "Only the realm owner can publish versions", details: null, hint: null, code: "PGRST" });
            }
            realm.version = String(body.p_version ?? realm.version);
            realm.payload = body.p_payload ?? realm.payload;
            realm.custom_def_spec = body.p_custom_def_spec ?? realm.custom_def_spec;
            this.realmVersions.push({
              id: randomId(),
              realm_id: realm.id,
              version: realm.version,
              payload: realm.payload,
              custom_def_spec: realm.custom_def_spec,
              changelog: body.p_changelog ?? null,
              created_at: new Date().toISOString(),
            });
            return this.send(res, 200, { version: realm.version });
          }
          if (fn === "acquire_realm") {
            const realm = this.realms.find((r) => r.id === body.p_realm_id);
            if (!realm || realm.status !== "PUBLISHED" || realm.visibility !== "PUBLIC") {
              return this.send(res, 400, { message: "Realm is not available for acquisition", details: null, hint: null, code: "PGRST" });
            }
            realm.download_count += 1;
            res.writeHead(204);
            res.end();
            return;
          }
          return this.send(res, 404, { message: `Unknown rpc ${fn}` });
        }
        // Every other PostgREST read (entitlement mirrors etc.) stays empty.
        return this.send(res, 200, []);
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

  /** Decode the caller's JWT (supabase-js always sends it on PostgREST calls). */
  private callerId(req: http.IncomingMessage): string | null {
    const payload = this.verify(this.bearer(req));
    return payload ? String(payload.sub) : null;
  }

  /** First `col=eq.value` filter for a column, or null. */
  private eqParam(params: URLSearchParams, column: string): string | null {
    const raw = params.get(column);
    if (raw === null) return null;
    return raw.startsWith("eq.") ? raw.slice(3) : raw;
  }

  /** Minimal select projection: unknown selects return the row unchanged. */
  private selectFields(row: Record<string, unknown>, select: string): Record<string, unknown> {
    if (!select) return row;
    const cols = select.split(",").map((c) => c.trim().split(":")[0]).filter(Boolean);
    const out: Record<string, unknown> = {};
    for (const col of cols) if (col in row) out[col] = row[col];
    return Object.keys(out).length ? out : row;
  }

  /** realms select with the embeds the marketplace list route asks for. */
  private selectRealmFields(row: FakeRealm, select: string, callerId: string | null): Record<string, unknown> {
    const base = this.selectFields(row as unknown as Record<string, unknown>, select);
    return {
      ...base,
      seller: row.seller_id ? { display_name: "E2E Seller" } : null,
      realm_votes: this.realmVotes.filter((v) => v.realm_id === row.id && v.user_id === callerId),
    };
  }

  /** PostgREST subset used by GET /rest/v1/realms: eq filters, tags contains,
   *  or=(…ilike…) search, order, and limit/offset via the range param. */
  private queryRealms(params: URLSearchParams, callerId: string | null): Record<string, unknown>[] {
    let rows = this.realms.slice();
    params.forEach((value: string, key: string) => {
      if (["select", "order", "limit", "offset"].includes(key)) return;
      if (key === "or") {
        const parts: string[] = value.slice(2, -1).split(",").map((p: string) => p.trim());
        const terms = parts
          .map((p: string) => /(\w+)\.ilike\.\*(.*)\*/.exec(p)?.[2])
          .filter((t): t is string => !!t);
        if (terms.length) {
          rows = rows.filter((r) =>
            terms.some(
              (t: string) =>
                r.name.toLowerCase().includes(t.toLowerCase()) ||
                r.description.toLowerCase().includes(t.toLowerCase()) ||
                r.game_slug.toLowerCase().includes(t.toLowerCase())
            )
          );
        }
        return;
      }
      const dot = value.indexOf(".");
      if (dot < 0) return;
      const op = value.slice(0, dot);
      const literal = value.slice(dot + 1);
      if (op === "eq") {
        rows = rows.filter((r) => String((r as any)[key]) === literal);
      } else if (op === "cs") {
        // tags=cs.{tag} — PostgREST array-contains, used for the tag filter.
        const tag = literal.replace(/^\{|\}$/g, "");
        rows = rows.filter((r) => (r.tags as string[]).includes(tag));
      }
    });
    const order = params.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      rows.sort((a, b) => String((a as any)[col]).localeCompare(String((b as any)[col])));
      if (dir === "desc") rows.reverse();
    }
    const offset = Number(params.get("offset") || 0);
    const limit = Number(params.get("limit") || 0);
    let slice = offset > 0 ? rows.slice(offset) : rows;
    if (limit > 0) slice = slice.slice(0, limit);
    const select = params.get("select") || "";
    return slice.map((r) => this.selectRealmFields(r, select, callerId));
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
