import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { getAuthenticatedUser } from "@/lib/auth";
import { SyncTask, findActiveSyncTask } from "@/lib/syncEngine";
import { fetchVerifiedManifest, parseInviteLink } from "@/lib/realmsync";

const syncRequestSchema = z.object({
  host: z.string().min(3).max(100),
  codeId: z.string().regex(/^[0-9A-Fa-f]{8}$/),
  secret: z.string().regex(/^[0-9A-Fa-f]{32}$/),
  gamePath: z.string().max(300).optional(),
});

// Steam folder names for the games the sync flow knows how to locate/launch
const GAME_FOLDERS: Record<string, string> = {
  valheim: "Valheim",
  "lethal company": "Lethal Company",
};

/**
 * The gamePath becomes the extraction cwd for host-controlled archives, so it
 * is constrained: absolute, exists, no shell/path metacharacters, and for known
 * games the final segment must be the game's own folder name.
 */
function isValidGamePath(gamePath: string, game: string): boolean {
  if (!gamePath || gamePath.includes("\0")) return false;
  const isAbsolute = /^([A-Za-z]:[\\/]|\/)/.test(gamePath);
  if (!isAbsolute) return false;
  if (/[<>:"|?*]/.test(gamePath)) return false;
  if (!fs.existsSync(gamePath)) return false;
  const expectedFolder = GAME_FOLDERS[game.toLowerCase()];
  if (expectedFolder && path.basename(gamePath).toLowerCase() !== expectedFolder.toLowerCase()) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = syncRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
    }
    const { host, codeId, secret, gamePath } = parsed.data;

    // Re-validate host+code as a full invite link (strict host format, blocked ranges)
    const link = parseInviteLink(`realmsync://${host}/${codeId}${secret}`);
    if (!link) {
      return NextResponse.json({ error: "Invalid invite host or code." }, { status: 400 });
    }

    // Never trust a client-posted manifest: fetch it from the host ourselves,
    // with the HMAC proof and signature verification.
    const manifest = await fetchVerifiedManifest(host, codeId, secret, { timeoutMs: 15000 });

    const customGamePath = gamePath || "";
    if (customGamePath && !isValidGamePath(customGamePath, manifest.game)) {
      return NextResponse.json({
        error: `"${customGamePath}" is not a valid ${manifest.game} game directory. Use the game's Steam installation folder.`
      }, { status: 400 });
    }

    // One task per invite+path: a second click rejoins the running sync
    const active = findActiveSyncTask(host, codeId, customGamePath);
    if (active) {
      return NextResponse.json({ taskId: active.id });
    }

    const task = new SyncTask({
      host,
      codeId,
      secret,
      manifest,
      customGamePath,
      userId: user.id,
    });

    return NextResponse.json({ taskId: task.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
