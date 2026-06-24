import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseSpec } from "@/lib/definitions/serialize";
import fs from "fs";
import path from "path";

// Resolve config file info from the server's definition spec
async function getConfigInfo(
  server: { definitionId: string | null; game: string },
  serverId: string
): Promise<{ filePath: string; filename: string; format: string; editable: boolean } | null> {
  const root = process.cwd();
  const def = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!def) return null;
  const spec = parseSpec(def.spec);
  if (!spec.editableConfigPath) {
    return { filePath: "", filename: "", format: "none", editable: false };
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
  return {
    filePath: path.join(root, "local-servers", serverId, ...rel.split("/")),
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

    const access = await verifyServerAccess(params.id, user.id);
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

    let content = "";
    if (fs.existsSync(configInfo.filePath)) {
      content = fs.readFileSync(configInfo.filePath, "utf-8");
    } else {
      content = `# Config file not yet generated.\n# Start the server once to generate the default ${configInfo.filename} file.\n`;
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

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
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

    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Content must be a string" }, { status: 400 });
    }

    // Ensure parent directories exist
    const dir = path.dirname(configInfo.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configInfo.filePath, content, "utf-8");

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Updated config file '${configInfo.filename}' for server '${server.name}' (${server.game}).`,
      },
    });

    return NextResponse.json({ success: true, message: "Configuration saved successfully." });
  } catch (error: any) {
    console.error("PUT /api/servers/[id]/config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
