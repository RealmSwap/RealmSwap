"use server";

// Server actions for the marketing site — NO-OP BASELINE.
//
// This file establishes the server-action surface and the seam to the shared
// Supabase backend. It does NOT implement a real feature yet: with no backend
// configured, every action short-circuits to a "not configured" result. Nothing
// here is wired into the UI. When `feat/supabase-shared-services` lands, fill in
// the persistence and wire the relevant form(s) to these actions.

import { getSupabaseServerClient } from "@/lib/backend/supabase";

export type ActionResult = {
  ok: boolean;
  message: string;
};

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  message: "Backend not configured yet — this is a baseline no-op.",
};

/**
 * Example: capture an email for release/update notifications.
 * Baseline no-op — validates the shape only, then returns NOT_CONFIGURED until
 * the shared Supabase backend is wired in.
 */
export async function subscribeToUpdates(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { ok: false, message: "Email is required." };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NOT_CONFIGURED;
  }

  // TODO(realmswap-supabase): persist `email` to the shared waitlist table.
  return { ok: true, message: "Subscribed." };
}
