import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { requireLocalServer } from "@/lib/agents/perimeter";
import {
  installModpackOnServer, isPackResolveError, bootOutputOf,
} from "@/lib/mods/installPack";

// POST /api/servers/[id]/mods/install-pack
// Body: { provider: "curseforge" | "modrinth", projectId: string, fileId?: number, versionId?: string }
//
// One-click install of a modpack from the in-app pack gallery. The whole
// pipeline (resolve → download → pre-flight → snapshot → apply → sandbox
// boot test → rollback-on-failure) lives in lib/mods/installPack.ts so realm
// materialization rides the identical path; this route adds auth, server
// checks, and HTTP error mapping.
const CURSEFORGE_PROJECT_ID = /^\d+$/;
// Modrinth migrated project ids from UUIDs to 8-char base62 ids (every
// search/gallery result carries one), so both shapes must be accepted here —
// a UUID-only check 400s every modern Modrinth pack before it can resolve.
const MODRINTH_PROJECT_ID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$|^[A-Za-z0-9]{8}$/;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    const packInstallSchema = z.object({
      provider: z.enum(["curseforge", "modrinth"]).default("curseforge"),
      projectId: z.string().min(1, "A modpack id is required"),
      fileId: z.number().int().positive().optional(),
      versionId: z.string().min(1).optional(),
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
    });
    const parsed = packInstallSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid modpack install parameters", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const provider = parsed.data.provider;
    const projectId = parsed.data.projectId;
    if (provider === "curseforge" && !CURSEFORGE_PROJECT_ID.test(projectId)) {
      return NextResponse.json({ error: "A numeric CurseForge modpack id is required" }, { status: 400 });
    }
    if (provider === "modrinth" && !MODRINTH_PROJECT_ID.test(projectId)) {
      return NextResponse.json({ error: "A Modrinth project id is required" }, { status: 400 });
    }

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    requireLocalServer(server, "Modpack installs");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before installing a modpack." }, { status: 400 });
    }

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack installs are only supported for Minecraft servers." }, { status: 400 });
    }

    try {
      const result = await installModpackOnServer({
        serverId,
        serverName: server.name,
        userId: user.id,
        provider,
        projectId,
        fileId: parsed.data.fileId,
        versionId: parsed.data.versionId,
        installId: parsed.data.installId,
      });
      return NextResponse.json({ success: true, ...result });
    } catch (installError: any) {
      if (isPackResolveError(installError)) {
        return NextResponse.json({ error: installError.message }, { status: 400 });
      }
      console.error(`[Sandbox] pack install failed for ${serverId}:`, installError);
      const bootOutput = bootOutputOf(installError);
      const warnings: string[] | undefined = installError.warnings;
      return NextResponse.json({
        error: `Modpack install failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(bootOutput ? { bootOutput } : {}),
        ...(warnings?.length ? { warnings } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install-pack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
