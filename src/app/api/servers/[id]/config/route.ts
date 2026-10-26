import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseSpec } from "@/lib/definitions/serialize";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { agentReadServerFile, agentWriteServerFile } from "@/lib/agents/agentFiles";

// Resolve config file info from the server's definition spec
async function getConfigInfo(
  server: { definitionId: string | null; game: string },
  serverId: string
): Promise<{ relPath: string; filename: string; format: string; editable: boolean } | null> {
  const def = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!def) return null;
  const spec = parseSpec(def.spec);
  if (!spec.editableConfigPath) {
    return { relPath: "", filename: "", format: "none", editable: false };
  }
  const rel = spec.editableConfigPath;
  const filename = rel.split("/").pop() || rel;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const format =
    ext === "properties" ? "properties" :
    ext === "json" ? "json" :
    ext === "ini" ? "ini" :
    ext === "cfg" ? "cfg" :
    "text";
  // editableConfigPath is relative to the server root — the same tree the
  // agent's data dir mirrors, so the rel path works on both machines.
  return {
    relPath: rel,
    filename,
    format,
    editable: true,
  };
}

// GET: Read config file
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Config files can embed credentials (e.g. rcon.password in
    // server.properties), so reading them sits behind the same ADMIN gate as
    // the dedicated secrets route.
    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const { server } = access;
    const configInfo = await getConfigInfo(server, params.id);

    if (!configInfo) {
      return NextResponse.json({ error: "Unsupported game" }, { status: 400 });
    }

    if (!configInfo.editable) {
      return NextResponse.json({
        content: "",
        filename: "",
        format: "none",
        editable: false,
        message: `${server.game} uses command-line arguments for configuration. Settings are applied at server creation time and through the password field on the dashboard.`,
      });
    }

    // AGENT servers: the file lives on the node — ferry it over the command
    // queue instead of reading the (wrong) dashboard disk.
    let content = "";
    if (server.runnerType === "AGENT") {
      const remote = await agentReadServerFile(params.id, configInfo.relPath);
      content = remote.exists && remote.content !== null
        ? remote.content
        : `# Config file not yet generated.\n# Start the server once to generate the default ${configInfo.filename} file.\n`;
    } else {
      const filePath = safeJoin(path.join(dataRoot(), "local-servers", params.id), configInfo.relPath);
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf-8");
      } else {
        content = `# Config file not yet generated.\n# Start the server once to generate the default ${configInfo.filename} file.\n`;
      }
    }

    return NextResponse.json({
      content,
      filename: configInfo.filename,
      format: configInfo.format,
      editable: true,
    });
  } catch (error) {
    console.error("GET /api/servers/[id]/config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Write config file
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json(
        { error: "Stop the server before editing configuration files." },
        { status: 400 }
      );
    }

    const configInfo = await getConfigInfo(server, params.id);
    if (!configInfo || !configInfo.editable) {
      return NextResponse.json({ error: "This game does not support config editing." }, { status: 400 });
    }

    const configSchema = z.object({
      content: z.string()
    });

    const body = await req.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid content format", details: parsed.error.format() }, { status: 400 });
    }

    const newContent = parsed.data.content;

    // AGENT servers write through the node (the dashboard's local-servers
    // tree is the wrong machine); the agent keeps the .rsbak parity copy.
    if (server.runnerType === "AGENT") {
      await agentWriteServerFile(params.id, configInfo.relPath, newContent, { backup: true });
    } else {
      const filePath = safeJoin(path.join(dataRoot(), "local-servers", params.id), configInfo.relPath);

      // Ensure parent directories exist
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Back up the current file so a bad edit is one click to undo (the raw
      // editor is an advanced tool; this keeps a last-known-good copy on disk).
      if (fs.existsSync(filePath)) {
        try {
          fs.copyFileSync(filePath, `${filePath}.rsbak`);
        } catch (e) {
          console.error("Config backup failed (continuing with save):", e);
        }
      }

      fs.writeFileSync(filePath, newContent, "utf-8");
    }

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_CONFIG",
        details: `Updated config file '${configInfo.filename}' for server '${server.name}' (${server.game}).`,
      },
    });

    return NextResponse.json({ success: true, message: "Configuration saved successfully." });
  } catch (error: any) {
    console.error("PUT /api/servers/[id]/config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
