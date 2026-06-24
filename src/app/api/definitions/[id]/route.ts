import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { validateSpec } from "@/lib/definitions/validate";
import { parseSpec, stringifySpec } from "@/lib/definitions/serialize";
import type { GameDefinitionSpec, InstallMethod } from "@/lib/definitions/types";

/** Serialize a DB record for API consumers: parse the spec JSON to an object. */
function serialize(d: {
  id: string;
  slug: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  recommendedRamGB: number;
  requiredDiskGB: number;
  ownerId: string | null;
  isBuiltIn: boolean;
  installMethod: string;
  spec: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...d,
    spec: parseSpec(d.spec),
  };
}

/** Load a definition visible to the given user (built-in or owned). */
async function loadOwned(id: string, userId: string) {
  return prisma.gameDefinition.findFirst({
    where: {
      id,
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
  });
}

// GET /api/definitions/[id]
// Returns the definition (spec parsed) if it is built-in OR owned by the caller; else 404.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const def = await loadOwned(params.id, user.id);
    if (!def) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(serialize(def));
  } catch (error) {
    console.error("GET /api/definitions/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/definitions/[id]
// Updates a caller-owned, non-built-in definition.
// 401 if unauthenticated; 404 if not owned; 403 if built-in; 400 on validation errors;
// 403 if installMethod is CUSTOM_SCRIPT and caller is not ADMIN.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.gameDefinition.findUnique({
      where: { id: params.id },
    });

    // 404 if not found or not owned by caller (built-in defs have ownerId null)
    if (!existing || existing.ownerId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 403 if built-in (read-only)
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: "Built-in definitions are read-only." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const installMethod = (body.installMethod ?? existing.installMethod) as InstallMethod;

    const spec = body.spec as GameDefinitionSpec | undefined;
    if (!spec || typeof spec !== "object") {
      return NextResponse.json({ error: "spec is required" }, { status: 400 });
    }

    // Admin gate for CUSTOM_SCRIPT
    if (installMethod === "CUSTOM_SCRIPT" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Custom script definitions require an admin account." },
        { status: 403 }
      );
    }

    // Re-validate spec
    const errors = validateSpec(spec, installMethod);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    // Derive requiredDiskGB from spec.install if available
    const installAny = spec.install as any;
    const requiredDiskGB =
      typeof installAny?.requiredDiskGB === "number"
        ? installAny.requiredDiskGB
        : existing.requiredDiskGB;

    const updated = await prisma.gameDefinition.update({
      where: { id: params.id },
      data: {
        displayName: body.displayName ?? existing.displayName,
        icon: body.icon ?? existing.icon,
        color: body.color ?? existing.color,
        description: body.description ?? existing.description,
        recommendedRamGB:
          body.recommendedRamGB != null
            ? Number(body.recommendedRamGB)
            : existing.recommendedRamGB,
        requiredDiskGB,
        installMethod,
        spec: stringifySpec(spec),
      },
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    console.error("PUT /api/definitions/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/definitions/[id]
// Deletes a caller-owned, non-built-in definition if no Server references it.
// 401 if unauthenticated; 404 if not owned; 403 if built-in; 409 if in use.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.gameDefinition.findUnique({
      where: { id: params.id },
    });

    // 404 if not found or not owned by caller
    if (!existing || existing.ownerId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 403 if built-in
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: "Built-in definitions cannot be deleted." },
        { status: 403 }
      );
    }

    // 409 if any Server references this definition
    const inUse = await prisma.server.count({
      where: { definitionId: params.id },
    });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `This definition is used by ${inUse} server(s). Delete them first.`,
        },
        { status: 409 }
      );
    }

    await prisma.gameDefinition.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/definitions/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
