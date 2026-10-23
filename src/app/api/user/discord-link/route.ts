import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Codes are 6 digits with a 15-minute expiry — without a per-user cap an
    // attacker can simply try every code and attach someone's Discord id to
    // their own account. 5 tries per window is generous for a copy-paste.
    if (!checkRateLimit(`discord_link_${user.id}`, { limit: 5, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }

    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Sanitize input in case they pasted the "# " prefix
    const cleanCode = code.replace(/[^0-9]/g, "");

    // Find valid code
    const linkCode = await prisma.discordLinkCode.findUnique({
      where: { code: cleanCode }
    });

    if (!linkCode) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (linkCode.expiresAt < new Date()) {
      await prisma.discordLinkCode.delete({ where: { id: linkCode.id } });
      return NextResponse.json({ error: "Code has expired" }, { status: 400 });
    }

    // Link the discordId
    await prisma.user.update({
      where: { id: user.id },
      data: { discordId: linkCode.discordId }
    });

    // Delete the used code
    await prisma.discordLinkCode.delete({ where: { id: linkCode.id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to link Discord account" }, { status: 500 });
  }
}
