import http from "http";
import url from "url";
import path from "path";
import fs from "fs";
import * as tar from "tar";
import { prisma } from "@/lib/db";
import { mapPort, unmapPort, getPublicIP } from "@/lib/upnp";
import {
  REALMSYNC_PROTOCOL_VERSION,
  CODE_ID_LENGTH,
  FailureLimiter,
  signBody,
  verifyAuthToken,
  secretFromStoredInvite,
} from "@/lib/realmsync";

// Persist state across Next.js reloads
const globalForSyncServer = globalThis as unknown as {
  syncServer: http.Server | null;
  syncPort: number | null;
  publicIp: string | null;
  syncStartPromise: Promise<{ publicIp: string; port: number }> | null;
  syncRenewalTimer: NodeJS.Timeout | null;
  syncFailureLimiter: FailureLimiter | null;
};

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const UPNP_RENEWAL_MS = 30 * 60 * 1000; // mappings default to a 1h TTL — renew at half-life

function getLimiter(): FailureLimiter {
  if (!globalForSyncServer.syncFailureLimiter) {
    // 10 failures within 60s blocks the IP for the rest of the window
    globalForSyncServer.syncFailureLimiter = new FailureLimiter(10, 60_000);
  }
  return globalForSyncServer.syncFailureLimiter;
}

export async function startRealmSyncServer(): Promise<{ publicIp: string, port: number }> {
  // If already running, return existing info
  if (globalForSyncServer.syncServer && globalForSyncServer.publicIp && globalForSyncServer.syncPort) {
    return { publicIp: globalForSyncServer.publicIp, port: globalForSyncServer.syncPort };
  }
  // Concurrent invite creations must share one listen() attempt (EADDRINUSE race)
  if (globalForSyncServer.syncStartPromise) {
    return globalForSyncServer.syncStartPromise;
  }

  globalForSyncServer.syncStartPromise = (async () => {
    // Find public IP
    const publicIp = await getPublicIP();
    if (!publicIp) {
      throw new Error("Could not determine your Public IP address. Ensure you are connected to the internet.");
    }

    try {
      return await new Promise<{ publicIp: string; port: number }>((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
          const limiter = getLimiter();
          const clientIp = req.socket.remoteAddress || "unknown";
          try {
            if (limiter.isBlocked(clientIp)) {
              res.writeHead(429, { "Content-Type": "text/plain" });
              res.end("Too many failed attempts");
              return;
            }

            const reqUrl = url.parse(req.url || "", true);
            const pathname = reqUrl.pathname || "";

            // Parse route: /sync/:codeId/manifest or /configs. The path carries
            // ONLY the public codeId — the secret never crosses the network.
            const match = pathname.match(/^\/sync\/([A-Fa-f0-9]{8})\/(manifest|configs)$/);

            if (!match) {
              res.writeHead(404, { "Content-Type": "text/plain" });
              res.end("Not found");
              return;
            }

            const codeId = match[1].toUpperCase();
            const action = match[2];

            const dbServer = await prisma.server.findFirst({
              where: { inviteCode: { contains: `/${codeId}` } },
              include: { mods: true }
            });

            if (!dbServer) {
              limiter.fail(clientIp);
              res.writeHead(404, { "Content-Type": "text/plain" });
              res.end("Invalid invite code");
              return;
            }

            const secret = secretFromStoredInvite(dbServer.inviteCode);
            const authHeaderRaw = (req.headers.authorization || "").replace(/^RealmSync\s+/i, "");
            if (!secret || !verifyAuthToken(secret, req.method || "GET", pathname, authHeaderRaw)) {
              limiter.fail(clientIp);
              res.writeHead(401, { "Content-Type": "text/plain" });
              res.end("Unauthorized");
              return;
            }

            limiter.reset(clientIp);

            if (action === "manifest") {
              // Serve JSON Manifest (HMAC-signed so the client can detect tampering)
              const manifest = {
                protocolVersion: REALMSYNC_PROTOCOL_VERSION,
                serverName: dbServer.name,
                game: dbServer.game,
                gameVersion: "latest",
                address: `${publicIp}:${dbServer.port}`, // Important: use the public IP and the game port for the client to connect
                mods: dbServer.mods.map(m => ({
                  provider: m.provider,
                  packageId: m.packageId,
                  version: m.version,
                  name: m.name,
                  dependencies: parseDependencies(m.dependencies)
                })),
                configDownloadUrl: `/sync/${codeId}/configs`
              };

              const body = JSON.stringify(manifest);
              res.writeHead(200, {
                "Content-Type": "application/json",
                "x-realmsync-signature": signBody(secret, body)
              });
              res.end(body);
              return;
            }

            if (action === "configs") {
              // Serve gzipped tar of config dirs, fully buffered so the body can
              // be HMAC-signed as a whole and tar errors surface as clean 500s
              // instead of unhandled stream errors mid-response.
              const dataDir = process.env.GAMEVAULT_DATA_DIR || process.cwd();
              const serverPath = dbServer.localPath || path.join(dataDir, "local-servers", dbServer.id);

              if (!fs.existsSync(serverPath)) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Server files not found");
                return;
              }

              const possiblePaths = ["config", "BepInEx/config", "plugins"];
              const pathsToSync: string[] = [];
              for (const p of possiblePaths) {
                if (fs.existsSync(path.join(serverPath, p))) {
                  pathsToSync.push(p);
                }
              }

              if (pathsToSync.length === 0) {
                // If there are no configs (e.g. vanilla server), return 204 No Content instead of failing
                res.writeHead(204);
                res.end();
                return;
              }

              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                tar.c({
                  gzip: true,
                  cwd: serverPath,
                }, pathsToSync)
                  .on("data", (c: Buffer) => chunks.push(c))
                  .on("end", () => resolve())
                  .on("error", (e) => reject(e));
              });
              const body = Buffer.concat(chunks);

              if (body.length > MAX_ARCHIVE_BYTES) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Config bundle too large to sync");
                return;
              }

              const filename = `${dbServer.name.replace(/[^a-zA-Z0-9]/g, "_")}_configs.tar.gz`;
              res.writeHead(200, {
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Type": "application/x-gzip",
                "x-realmsync-signature": signBody(secret, body)
              });
              res.end(body);
              return;
            }
          } catch (err: any) {
            console.error("RealmSync Host Error:", err);
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "text/plain" });
            }
            res.end("Internal server error");
          }
        });

        server.on("error", (err) => {
          reject(err);
        });

        // Listen on a static port (e.g., 3001) so manual port forwarding is possible if UPnP fails
        server.listen(3001, "0.0.0.0", async () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Failed to bind server"));
            return;
          }

          const port = address.port;

          // UPnP Map Port
          const mapped = await mapPort(port, "TCP", "RealmSync Host");
          if (!mapped) {
            console.warn(`[RealmSync] Failed to UPnP port forward. Manual port forwarding for TCP ${port} is required.`);
            // We do NOT reject here anymore. We allow the server to run so the user can manually port forward.
          }

          if (globalForSyncServer.syncRenewalTimer) {
            clearInterval(globalForSyncServer.syncRenewalTimer);
          }
          // Router mappings lapse after ~1h; keep the invite alive while any is active
          globalForSyncServer.syncRenewalTimer = setInterval(() => {
            mapPort(port, "TCP", "RealmSync Host").catch(() => {});
          }, UPNP_RENEWAL_MS);
          globalForSyncServer.syncRenewalTimer.unref?.();

          globalForSyncServer.syncServer = server;
          globalForSyncServer.syncPort = port;
          globalForSyncServer.publicIp = publicIp;

          console.log(`[RealmSync] Host Server running on ${publicIp}:${port}`);
          resolve({ publicIp, port });
        });
      });
    } catch (err) {
      // Allow a later invite attempt to retry after EADDRINUSE etc.
      globalForSyncServer.syncServer = null;
      globalForSyncServer.syncPort = null;
      globalForSyncServer.publicIp = null;
      throw err;
    }
  })();

  try {
    return await globalForSyncServer.syncStartPromise;
  } finally {
    globalForSyncServer.syncStartPromise = null;
  }
}

function parseDependencies(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function stopRealmSyncServer() {
  if (globalForSyncServer.syncRenewalTimer) {
    clearInterval(globalForSyncServer.syncRenewalTimer);
    globalForSyncServer.syncRenewalTimer = null;
  }

  if (globalForSyncServer.syncPort) {
    await unmapPort(globalForSyncServer.syncPort, "TCP");
  }

  if (globalForSyncServer.syncServer) {
    const server = globalForSyncServer.syncServer;
    // Drop keep-alive sockets so close() isn't held open by lingering clients
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  globalForSyncServer.syncServer = null;
  globalForSyncServer.syncPort = null;
  globalForSyncServer.publicIp = null;
  globalForSyncServer.syncStartPromise = null;

  console.log(`[RealmSync] Host Server stopped`);
}
