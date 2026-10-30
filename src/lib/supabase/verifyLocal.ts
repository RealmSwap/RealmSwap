import jwt from "jsonwebtoken";

export interface LocalTokenPayload {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Verify a Supabase access token locally (HS256 against SUPABASE_JWT_SECRET).
 *
 * This is what keeps the dashboard working with no internet: RealmSwap hosts
 * game servers that keep running while cloud auth is unreachable, and a live
 * Supabase round-trip per API call turned every outage into "the whole app
 * 401s and bounces me to a login screen that can't log me in either".
 *
 * Returns null when SUPABASE_JWT_SECRET isn't configured or the token is
 * invalid/expired — callers then fall back to the online verification path.
 * Configure SUPABASE_JWT_SECRET (Dashboard → Settings → API → JWT Secret) to
 * enable offline auth.
 */
export function verifySupabaseTokenLocal(token: string): LocalTokenPayload | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "object" && payload !== null && typeof payload.sub === "string") {
      return payload as LocalTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
