import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { validateSpec } from "@/lib/definitions/validate";
import { parseSpec, stringifySpec } from "@/lib/definitions/serialize";
import { ensureBuiltinsSeeded } from "@/lib/definitions/ensureSeeded";
import { uniqueSlug } from "@/lib/definitions/slug";
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

// GET /api/definitions
// Returns built-in definitions + the authenticated user's own custom definitions.
export async function GET(_req: NextRequest) {
  try {
    await ensureBuiltinsSeeded();

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const definitions = await prisma.gameDefinition.findMany({
      where: {
        OR: [
          { isBuiltIn: true },
          { ownerId: user.id },
        ],
      },
      orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ definitions: definitions.map(serialize) });
  } catch (error) {
    console.error("GET /api/definitions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/definitions
// Creates a new per-user custom game definition.
// Body: { displayName, installMethod, spec, icon?, color?, description?, recommendedRamGB? }
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      displayName,
      installMethod,
      spec: specInput,
      icon = "🎮",
      color = "from-slate-500 to-slate-700 bg-slate-500/10 border-slate-500/30 text-slate-400",
      description = "",
      recommendedRamGB = 4,
    } = body;

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json({ error: "displayName is required." }, { status: 400 });
    }
    if (!installMethod || !["STEAMCMD", "DOWNLOAD", "CUSTOM_SCRIPT"].includes(installMethod)) {
      return NextResponse.json(
        { error: "installMethod must be one of STEAMCMD, DOWNLOAD, CUSTOM_SCRIPT." },
        { status: 400 }
      );
    }
    if (!specInput || typeof specInput !== "object") {
      return NextResponse.json({ error: "spec is required and must be a JSON object." }, { status: 400 });
    }

    // CUSTOM_SCRIPT definitions are restricted to ADMINs
    if (installMethod === "CUSTOM_SCRIPT" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only administrators may create CUSTOM_SCRIPT definitions." },
        { status: 403 }
      );
    }

    // Validate the spec
    const spec = specInput as GameDefinitionSpec;
    const errors = validateSpec(spec, installMethod as InstallMethod);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    // Derive requiredDiskGB from spec.install if available
    const installAny = spec.install as any;
    const requiredDiskGB =
      typeof installAny?.requiredDiskGB === "number" ? installAny.requiredDiskGB : 3;

    // Generate a unique slug among this user's existing custom definitions
    const existingDefs = await prisma.gameDefinition.findMany({
      where: { ownerId: user.id },
      select: { slug: true },
    });
    const existingSlugs = existingDefs.map((d) => d.slug);
    const slug = uniqueSlug(displayName, existingSlugs);

    const created = await prisma.gameDefinition.create({
      data: {
        slug,
        displayName,
        icon,
        color,
        description,
        recommendedRamGB,
        requiredDiskGB,
        ownerId: user.id,
        isBuiltIn: false,
        installMethod,
        spec: stringifySpec(spec),
      },
    });

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/definitions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
