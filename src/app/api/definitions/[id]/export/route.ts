import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { buildDefinitionFile, DEFINITION_FILE_SUFFIX } from "@/lib/definitions/definitionFile";

// GET /api/definitions/[id]/export
//
// Download one of the caller's own game definitions as a shareable file.
// Built-ins aren't exported (everyone already has them), and a definition the
// shared-definition gate would refuse on import — scripts, PATH programs —
// answers 400 with the reasons instead of producing a file nobody can open.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const def = await prisma.gameDefinition.findFirst({ where: { id: params.id, ownerId: user.id } });
    if (!def) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const built = buildDefinitionFile(def);
    if (!built.ok) {
      return NextResponse.json(
        { error: `This definition can't be shared: ${built.errors.slice(0, 3).join(" ")}`, details: built.errors },
        { status: 400 },
      );
    }

    return new NextResponse(JSON.stringify(built.file, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${def.slug}${DEFINITION_FILE_SUFFIX}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/definitions/[id]/export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
