import http from "http";
import url from "url";
import path from "path";
import fs from "fs";
import * as tar from "tar";
import { prisma } from "@/lib/db";
import { mapPort, unmapPort, getPublicIP } from "@/lib/upnp";

// Persist the HTTP server instance across Next.js reloads
const globalForSyncServer = globalThis as unknown as {
  syncServer: http.Server | null;
  syncPort: number | null;
  publicIp: string | null;
};

export async function startRealmSyncServer(): Promise<{ publicIp: string, port: number }> {
  // If already running, return existing info
  if (globalForSyncServer.syncServer && globalForSyncServer.publicIp && globalForSyncServer.syncPort) {
    return { publicIp: globalForSyncServer.publicIp, port: globalForSyncServer.syncPort };
  }

  // Find public IP
  const publicIp = await getPublicIP();
  if (!publicIp) {
    throw new Error("Could not determine your Public IP address. Ensure you are connected to the internet.");
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = url.parse(req.url || "", true);
        const pathname = reqUrl.pathname || "";

        // Parse route: /sync/:inviteCode/manifest or /configs
        const match = pathname.match(/^\/sync\/([a-zA-Z0-9]+)\/(manifest|configs)$/);
        
        if (!match) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const inviteCode = match[1];
        const action = match[2];

        const dbServer = await prisma.server.findUnique({
          where: { inviteCode },
          include: { mods: true }
        });

        if (!dbServer) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Invalid invite code");
          return;
        }

        if (action === "manifest") {
          // Serve JSON Manifest
          const manifest = {
            serverName: dbServer.name,
            game: dbServer.game,
            gameVersion: "latest",
            address: `${publicIp}:${dbServer.port}`, // Important: use the public IP and the game port for the client to connect
            mods: dbServer.mods.map(m => ({
              provider: m.provider,
              packageId: m.packageId,
              version: m.version,
              name: m.name,
              dependencies: m.dependencies ? JSON.parse(m.dependencies) : []
            })),
            configDownloadUrl: `/sync/${inviteCode}/configs`
          };
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(manifest));
          return;
        } 
        
        if (action === "configs") {
          // Serve Zipped Configs
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
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("No configurations found to sync");
            return;
          }

          const filename = `${dbServer.name.replace(/[^a-zA-Z0-9]/g, "_")}_configs.tar.gz`;
          res.writeHead(200, {
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Type": "application/x-gzip",
          });

          const tarStream = tar.c({
            gzip: true,
            cwd: serverPath,
          }, pathsToSync);

          tarStream.pipe(res);
          return;
        }
      } catch (err: any) {
        console.error("RealmSync Host Error:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
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

      globalForSyncServer.syncServer = server;
      globalForSyncServer.syncPort = port;
      globalForSyncServer.publicIp = publicIp;

      console.log(`[RealmSync] Host Server running on ${publicIp}:${port}`);
      resolve({ publicIp, port });
    });
  });
}

export async function stopRealmSyncServer() {
  if (globalForSyncServer.syncPort) {
    await unmapPort(globalForSyncServer.syncPort, "TCP");
  }
  
  if (globalForSyncServer.syncServer) {
    globalForSyncServer.syncServer.close();
  }
  
  globalForSyncServer.syncServer = null;
  globalForSyncServer.syncPort = null;
  globalForSyncServer.publicIp = null;
  
  console.log(`[RealmSync] Host Server stopped`);
}
