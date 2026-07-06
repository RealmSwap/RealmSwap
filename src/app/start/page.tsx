import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickEntryPath } from "@/lib/authEntry";

// Reads the session cookie and the DB on every request — must never be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Desktop entry point. The Electron window loads /start instead of the
 * marketing landing page, and we send the user to the right place:
 * dashboard (valid session), login (users exist), or register (fresh install).
 */
export default async function StartPage({ searchParams }: { searchParams: { link?: string } }) {
  const user = await getAuthenticatedUser();
  const userCount = user ? 0 : await prisma.user.count();
  let dest = pickEntryPath({ isAuthenticated: !!user, userCount });
  
  if (searchParams?.link) {
    dest += `?link=${encodeURIComponent(searchParams.link)}`;
  }
  
  redirect(dest);
}
