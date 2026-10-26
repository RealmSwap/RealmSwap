import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  // Clears the Supabase auth cookies via the ssr client.
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
