import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { pickEntryPath } from "@/lib/authEntry";

// Reads the session on every request — must never be statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Desktop entry point. The Electron window loads /start instead of the
 * marketing landing page, and we send the user to the right place:
 * dashboard (valid Supabase session) or login.
 */
export default async function StartPage({ searchParams }: { searchParams: { link?: string } }) {
  const user = await getAuthenticatedUser();
  let dest: string = pickEntryPath({ isAuthenticated: !!user });

  if (searchParams?.link) {
    dest += `?link=${encodeURIComponent(searchParams.link)}`;
  }

  redirect(dest);
}
