import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { parsePterodactylEgg } from "@/lib/pterodactyl";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Requires global ADMIN role." }, { status: 403 });
    }

    const body = await req.json();
    if (!body.eggJson) {
      return NextResponse.json({ error: "eggJson string is required in the body" }, { status: 400 });
    }

    const eggData = parsePterodactylEgg(body.eggJson, user.id);

    const definition = await prisma.gameDefinition.create({
      data: eggData
    });

    return NextResponse.json({ success: true, definition });
  } catch (error: any) {
    console.error("Egg Import Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
