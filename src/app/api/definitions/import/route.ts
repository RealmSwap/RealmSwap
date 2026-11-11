import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { readDefinitionFile, DEFINITION_FILE_MAX_BYTES } from "@/lib/definitions/definitionFile";
import { uniqueSlug } from "@/lib/definitions/slug";

// POST /api/definitions/import  { file, confirm? }
//
// Add a game definition from a shared file. Two calls, so the user sees what
// the definition installs and runs before it exists on this machine:
//   1. without `confirm` — validates the file and answers { preview };
//      nothing is written.
//   2. with `confirm: true` — validates again and creates the definition.
// The file goes through the shared-definition gate either way; a file that
// fails it answers 400 with the reasons.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > DEFINITION_FILE_MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large to be a game definition." }, { status: 413 });
    }
    let body: { file?: unknown; confirm?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }

    const read = readDefinitionFile(body?.file);
    if (!read.ok) {
      return NextResponse.json({ error: read.errors.slice(0, 3).join(" "), details: read.errors }, { status: 400 });
    }

    const preview = {
      displayName: read.displayName,
      description: read.description,
      icon: read.icon,
      recommendedRamGB: read.recommendedRamGB,
      definition: read.summary,
    };
    if (body.confirm !== true) {
      return NextResponse.json({ preview });
    }

    const existing = await prisma.gameDefinition.findMany({ where: { ownerId: user.id }, select: { slug: true } });
    const created = await prisma.gameDefinition.create({
      data: {
        slug: uniqueSlug(read.displayName, existing.map((d) => d.slug)),
        displayName: read.displayName,
        icon: read.icon,
        description: read.description,
        recommendedRamGB: read.recommendedRamGB,
        requiredDiskGB: read.requiredDiskGB,
        ownerId: user.id,
        isBuiltIn: false,
        installMethod: read.installMethod,
        spec: JSON.stringify(read.spec),
      },
    });

    return NextResponse.json({ id: created.id, slug: created.slug, displayName: created.displayName, preview }, { status: 201 });
  } catch (error) {
    console.error("POST /api/definitions/import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
