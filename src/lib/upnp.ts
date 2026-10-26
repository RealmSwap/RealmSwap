import NatAPI from "nat-api";
import https from "https";
import os from "os";

// Persist the NatAPI client globally across Next.js reloads
const globalForUpnp = globalThis as unknown as {
  natClient: any | undefined;
};

function getNatClient() {
  if (!globalForUpnp.natClient) {
    globalForUpnp.natClient = new NatAPI();
  }
  return globalForUpnp.natClient;
}

// Maps a port on the router pointing to this computer
export function mapPort(port: number, protocol: "TCP" | "UDP" = "UDP", description = "RealmSwap"): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      getNatClient().map({
        publicPort: port,
        privatePort: port,
        protocol: protocol,
        ttl: 3600, // Time to live in seconds
        description: description
      }, (err: any) => {
        if (err) {
          console.error(`[UPnP Error] Failed to map port ${port} (${protocol}):`, err.message || err);
          resolve(false);
        } else {
          console.log(`[UPnP] Successfully mapped port ${port} (${protocol})`);
          resolve(true);
        }
      });
    } catch (e: any) {
      console.error(`[UPnP Exception] Failed to map port ${port}:`, e.message);
      resolve(false);
    }
  });
}

// Unmaps a port from the router when the server is stopped
export function unmapPort(port: number, protocol: "TCP" | "UDP" = "UDP"): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      getNatClient().unmap({
        publicPort: port,
        privatePort: port,
        protocol: protocol
      }, (err: any) => {
        if (err) {
          console.error(`[UPnP Error] Failed to unmap port ${port} (${protocol}):`, err.message || err);
          resolve(false);
        } else {
          console.log(`[UPnP] Successfully unmapped port ${port} (${protocol})`);
          resolve(true);
        }
      });
    } catch (e: any) {
      console.error(`[UPnP Exception] Failed to unmap port ${port}:`, e.message);
      resolve(false);
    }
  });
}

// Fetches the public WAN IP of this machine. Time-boxed: invite generation
// and the sync-server bootstrap await this, and an ipify connection that
// never answers would hang both forever.
export function getPublicIP(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get("https://api.ipify.org?format=json", (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.ip || null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error("ipify request timed out")));
    req.on("error", () => {
      resolve(null);
    });
  });
}

// First non-internal, non-link-local IPv4 address — the honest address when
// the router refuses port mappings and only same-network play works.
// Link-local 169.254/16 means the adapter never got a DHCP lease (VPN/TAP
// virtual adapters often sit there) — nobody can join through it, and it
// used to win the interface order on machines where a real NIC came later.
export function getLanIP(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254.")) {
        return iface.address;
      }
    }
  }
  return null;
}
