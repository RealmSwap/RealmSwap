import { getPublicSupabaseClient } from "@/lib/backend/supabase";

/**
 * Hosted status page reads (`/s/[code]`): one row per server a host published
 * from their dashboard. The local app pushes snapshots with the owner's own
 * session (RLS `auth.uid() = owner_id` — see supabase/migrations/
 * 20261104120000_public_status.sql); this side only ever reads via the anon
 * key. The code is the capability.
 */

export type HostedServerStatus = {
  code: string;
  name: string;
  game: string;
  status: string; // raw RUNNING / STOPPED / CRASHED / …
  players: number | null; // null = running but the game didn't answer the query
  maxplayers: number | null;
  updated_at: string;
};

/**
 * The published snapshot for `code`, or null when the backend isn't
 * configured, the row doesn't exist, or Supabase hiccups — the marketing
 * page must never break because the relay is down.
 */
export async function getHostedStatus(code: string): Promise<HostedServerStatus | null> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_status")
    .select("code,name,game,status,players,maxplayers,updated_at")
    .eq("code", code)
    .maybeSingle()
    .returns<HostedServerStatus>();
  if (error) return null;
  return data ?? null;
}
