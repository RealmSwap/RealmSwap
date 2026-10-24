import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { swapDirIntoPlace, withServerLock } from "@/lib/atomicFs";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

// Helper to recursively copy directories
function copyFolderRecursiveSync(from: string, to: string) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  const files = fs.readdirSync(from);
  for (const file of files) {
    const srcPath = path.join(from, file);
    const destPath = path.join(to, file);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy a directory into a staging sibling, then swap it into place so a
// failed copy can never destroy the existing world.
function copyDirViaStaging(source: string, targetDir: string) {
  const staging = `${targetDir}.import-staging`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    copyFolderRecursiveSync(source, staging);
    swapDirIntoPlace(staging, targetDir);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Directory import where a single file is allowed: stage the copy either way.
function importIntoTarget(source: string, targetDir: string, isDir: boolean) {
  if (isDir) {
    copyDirViaStaging(source, targetDir);
    return;
  }
  const staging = `${targetDir}.import-staging`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    fs.mkdirSync(staging, { recursive: true });
    fs.copyFileSync(source, path.join(staging, path.basename(source)));
    swapDirIntoPlace(staging, targetDir);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Copy a file via temp+rename so an interrupted copy can't leave a truncated
// world file at the destination.
function copyFileAtomic(src: string, dest: string) {
  const tmp = `${dest}.importing`;
  try {
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

// POST /api/servers/[id]/import-world
// Body: { sourcePath: string }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const { sourcePath } = await req.json();

    if (!sourcePath) {
      return NextResponse.json({ error: "Source path is required" }, { status: 400 });
    }

    // Resolve absolute path and clean quotes
    const cleanedPath = sourcePath.replace(/^["']|["']$/g, "").trim();
    const resolvedSource = path.resolve(cleanedPath);

    if (!fs.existsSync(resolvedSource)) {
      return NextResponse.json(
        { error: `The specified path does not exist on your computer: "${resolvedSource}"` },
        { status: 400 }
      );
    }

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;
    requireLocalServer(server, "World imports");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json(
        { error: "Please stop the server before importing map files." },
        { status: 400 }
      );
    }

    const game = server.game.toUpperCase();
    const isDir = fs.statSync(resolvedSource).isDirectory();

    // Map targets depending on the game type
    if (game === "MINECRAFT") {
      if (!isDir) {
        return NextResponse.json({ error: "Minecraft world import requires a folder (not a file)." }, { status: 400 });
      }
      if (!fs.existsSync(path.join(resolvedSource, "level.dat"))) {
        return NextResponse.json(
          { error: "Invalid Minecraft world folder. A valid world folder must contain a 'level.dat' file." },
          { status: 400 }
        );
      }

      const targetDir = path.join(dataRoot(), "local-servers", serverId, "world");
      await withServerLock(serverId, async () => {
        copyDirViaStaging(resolvedSource, targetDir);
      });

    } else if (game === "VALHEIM") {
      const userProfile = process.env.USERPROFILE || "";
      const valheimSavesDir = path.join(userProfile, "AppData", "LocalLow", "IronGate", "Valheim", "worlds_local");

      if (!fs.existsSync(valheimSavesDir)) {
        fs.mkdirSync(valheimSavesDir, { recursive: true });
      }

      if (isDir) {
        // Copy all .db and .fwl files
        const files = fs.readdirSync(resolvedSource);
        let copied = 0;
        for (const file of files) {
          if (file.endsWith(".db") || file.endsWith(".fwl")) {
            copyFileAtomic(path.join(resolvedSource, file), path.join(valheimSavesDir, file));
            copied++;
          }
        }
        if (copied === 0) {
          return NextResponse.json({ error: "No Valheim world files (.db or .fwl) found in folder." }, { status: 400 });
        }
      } else {
        // Copy single file
        const ext = path.extname(resolvedSource);
        if (ext !== ".db" && ext !== ".fwl") {
          return NextResponse.json({ error: "Valheim saves must have a .db or .fwl extension." }, { status: 400 });
        }
        const basename = path.basename(resolvedSource, ext);
        copyFileAtomic(resolvedSource, path.join(valheimSavesDir, path.basename(resolvedSource)));

        // Try to copy paired file
        const otherExt = ext === ".db" ? ".fwl" : ".db";
        const pairedFile = path.join(path.dirname(resolvedSource), basename + otherExt);
        if (fs.existsSync(pairedFile)) {
          copyFileAtomic(pairedFile, path.join(valheimSavesDir, basename + otherExt));
        }
      }

    } else if (game === "ENSHROUDED") {
      const targetDir = path.join(dataRoot(), "local-servers", serverId, "enshrouded-server", "savegame");
      await withServerLock(serverId, async () => {
        importIntoTarget(resolvedSource, targetDir, isDir);
      });

    } else if (game === "ZOMBOID") {
      const targetDir = path.join(dataRoot(), "local-servers", serverId, "zomboid-server", "zomboid-data", "Saves", "Multiplayer", "servertest");
      if (!isDir) {
        return NextResponse.json({ error: "Project Zomboid saves require a folder containing sandbox configurations and map files." }, { status: 400 });
      }
      await withServerLock(serverId, async () => {
        copyDirViaStaging(resolvedSource, targetDir);
      });

    } else if (game === "ARK") {
      const targetDir = path.join(dataRoot(), "local-servers", serverId, "ark-server", "ShooterGame", "Saved", "SavedArksLocal");
      await withServerLock(serverId, async () => {
        importIntoTarget(resolvedSource, targetDir, isDir);
      });

    } else {
      return NextResponse.json({ error: `Map imports are not supported for game: ${server.game}` }, { status: 400 });
    }

    // Log action
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "IMPORT_WORLD",
        details: `Imported local map files from '${resolvedSource}' into server '${server.name}' (${server.game}).`,
      },
    });

    return NextResponse.json({ success: true, message: "Map imported successfully!" });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/import-world error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
