import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getServerStorageBreakdown, getFolderSizeBytesCached } from "@/lib/storageUsage";
import { bytesToGB } from "@/lib/diskUsage";
import { getFreeDiskSpaceGB } from "@/lib/preflight";
import { dataRoot } from "@/lib/appPaths";

// GET: everything the Storage page needs to answer "where's my disk going" —
// per-server folder breakdown (worlds/mods/logs/other), snapshot + backup
// sizes, 7-day growth from the disk telemetry stamps, and the free space of
// the drive that holds the data folder. Viewer-level: every teammate can see
// it; it carries no secrets, only sizes.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const servers = await prisma.server.findMany({
      where: {
        OR: [{ userId: user.id }, { collaborators: { some: { userId: user.id } } }],
      },
      select: { id: true, name: true, game: true, runnerType: true, status: true },
      orderBy: { createdAt: "desc" },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const perServer = await Promise.all(
      servers.map(async (s) => {
        const breakdown = await getServerStorageBreakdown(s.id, s.game, { awaitFresh: true });

        const [backupsAgg, snapshots, firstRow, lastRow] = await Promise.all([
          prisma.backup.aggregate({ where: { serverId: s.id }, _sum: { fileSizeMB: true } }),
          prisma.serverSnapshot.findMany({ where: { serverId: s.id }, select: { path: true } }),
          prisma.serverTelemetry.findFirst({
            where: { serverId: s.id, diskMB: { not: null }, createdAt: { gte: weekAgo } },
            orderBy: { createdAt: "asc" },
            select: { diskMB: true },
          }),
          prisma.serverTelemetry.findFirst({
            where: { serverId: s.id, diskMB: { not: null }, createdAt: { gte: weekAgo } },
            orderBy: { createdAt: "desc" },
            select: { diskMB: true },
          }),
        ]);

        let snapshotsGB: number | null = null;
        if (snapshots.length > 0) {
          const sizes = await Promise.all(snapshots.map((snap) => getFolderSizeBytesCached(snap.path)));
          snapshotsGB = bytesToGB(sizes.reduce<number>((sum, b) => sum + (b ?? 0), 0));
        }

        const growth7dGB =
          firstRow?.diskMB != null && lastRow?.diskMB != null
            ? Math.round(((lastRow.diskMB - firstRow.diskMB) / 1024) * 100) / 100
            : null;

        return {
          id: s.id,
          name: s.name,
          game: s.game,
          status: s.status,
          folderGB: bytesToGB(breakdown?.totalBytes ?? null),
          worldsGB: bytesToGB(breakdown?.worldsBytes ?? null),
          modsGB: bytesToGB(breakdown?.modsBytes ?? null),
          logsGB: bytesToGB(breakdown?.logsBytes ?? null),
          otherGB: bytesToGB(breakdown?.otherBytes ?? null),
          backupsGB: Math.round(((backupsAgg._sum.fileSizeMB ?? 0) / 1024) * 100) / 100,
          snapshotsGB,
          growth7dGB,
        };
      })
    );

    // Drive free space + vault archives (world exports; per-user, not per-server).
    const [freeGB, archivesAgg] = await Promise.all([
      getFreeDiskSpaceGB(dataRoot()).catch(() => null),
      prisma.archive.aggregate({ where: { userId: user.id }, _sum: { saveSizeGB: true } }),
    ]);

    return NextResponse.json({
      servers: perServer,
      totals: {
        freeGB: freeGB === null || freeGB > 9000 ? null : Math.round(freeGB * 10) / 10,
        archivesGB: Math.round((archivesAgg._sum.saveSizeGB ?? 0) * 100) / 100,
      },
      dataRoot: dataRoot(),
    });
  } catch (error: any) {
    console.error("GET /api/storage error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
