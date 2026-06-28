import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import {
  resolveStorageTarget,
  isInsideRoot,
  openFolderCommand,
} from "@/lib/storageLocations";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const root = dataRoot();
    let target: string | null = null;

    if (typeof body.serverId === "string" && body.serverId) {
      const server = await prisma.server.findUnique({ where: { id: body.serverId } });
      if (!server || server.userId !== user.id) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      target = path.join(root, "local-servers", server.id);
    } else if (typeof body.target === "string" && body.target) {
      target = resolveStorageTarget(body.target, root);
    }

    if (!target) {
      return NextResponse.json({ error: "Unknown target" }, { status: 400 });
    }
    if (!isInsideRoot(root, target)) {
      return NextResponse.json({ error: "Target outside data folder" }, { status: 400 });
    }
    if (!fs.existsSync(target)) {
      return NextResponse.json(
        { ok: false, error: "This folder doesn't exist yet. It's created the first time it's used." },
        { status: 200 }
      );
    }

    const { cmd, args } = openFolderCommand(process.platform, target);
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
