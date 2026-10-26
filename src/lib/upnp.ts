import dgram from "dgram";
import http from "http";
import https from "https";
import os from "os";

/**
 * Zero-dependency UPnP IGD client. Replaces `nat-api`, whose transitive
 * `request` chain carries unfixable critical advisories (SSRF, CRLF) and has
 * no patched release. Discovers the router's WANIP/WANPPP control endpoint
 * with SSDP, then sends SOAP AddPortMapping/DeletePortMapping.
 *
 * The exported surface matches the old client: mapPort/unmapPort resolve to
 * false on any failure (callers `if (!ok) throw` per port) and never reject.
 * Mappings carry a 1h lease and renew at a third of it — LocalRunner maps
 * once per start and nothing else renews game ports, so an unrenewed mapping
 * would silently expire mid-session.
 */

type Protocol = "TCP" | "UDP";

interface UpnpEndpoint {
  serviceType: string;
  controlUrl: string;
}

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const LEASE_SECONDS = 3600;

const globalForUpnp = globalThis as unknown as {
  upnpEndpoints?: UpnpEndpoint[];
  upnpDiscovering?: Promise<UpnpEndpoint[]>;
  upnpRenewals?: Map<string, NodeJS.Timeout>;
};

function renewals(): Map<string, NodeJS.Timeout> {
  if (!globalForUpnp.upnpRenewals) globalForUpnp.upnpRenewals = new Map();
  return globalForUpnp.upnpRenewals;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string
  ));
}

/** One SSDP reply → the advertised device-description URL, or null. */
export function parseSsdpLocation(packet: string): string | null {
  const match = packet.match(/^LOCATION:\s*(\S+)\s*$/im);
  return match ? match[1] : null;
}

/** Pick the best WAN-connection service from a router's device XML.
 *  WANIPConnection v2 is preferred, then v1, then WANPPPConnection. */
export function pickUpnpService(xml: string): UpnpEndpoint | null {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/g) ?? [];
  const candidates: UpnpEndpoint[] = [];
  for (const block of blocks) {
    const serviceType = block.match(/<serviceType>\s*([^<]+?)\s*<\/serviceType>/)?.[1];
    const controlUrl = block.match(/<controlURL>\s*([^<]+?)\s*<\/controlURL>/)?.[1];
    if (!serviceType || !controlUrl) continue;
    if (/WAN(IP|PPP)Connection/.test(serviceType)) candidates.push({ serviceType, controlUrl });
  }
  const rank = (e: UpnpEndpoint) =>
    e.serviceType.includes("WANIPConnection:2") ? 0 :
    e.serviceType.includes("WANIPConnection:1") ? 1 :
    e.serviceType.includes("WANPPPConnection") ? 2 : 3;
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] ?? null;
}

/** The AddPortMapping argument block; exported for tests. */
export function addPortMappingArgs(port: number, protocol: Protocol, description: string): string {
  return (
    `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort>` +
    `<NewProtocol>${protocol}</NewProtocol><NewInternalPort>${port}</NewInternalPort>` +
    `<NewInternalClient>${getLanIP() ?? "127.0.0.1"}</NewInternalClient><NewEnabled>1</NewEnabled>` +
    `<NewPortMappingDescription>${escapeXml(description)}</NewPortMappingDescription>` +
    `<NewLeaseDuration>${LEASE_SECONDS}</NewLeaseDuration>`
  );
}

function deletePortMappingArgs(port: number, protocol: Protocol): string {
  return (
    `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort>` +
    `<NewProtocol>${protocol}</NewProtocol>`
  );
}

function ssdpLocations(timeoutMs = 3500): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* already closed */ }
      resolve(Array.from(found));
    };
    sock.on("message", (buf) => {
      const loc = parseSsdpLocation(buf.toString());
      if (loc) found.add(loc);
    });
    sock.on("error", finish);
    sock.bind(() => {
      for (const st of [
        "urn:schemas-upnp-org:service:WANIPConnection:2",
        "urn:schemas-upnp-org:service:WANIPConnection:1",
        "urn:schemas-upnp-org:service:WANPPPConnection:1",
      ]) {
        sock.send(
          `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
          `MAN: "ssdp:discover"\r\nMX: 3\r\nST: ${st}\r\n\r\n`,
          SSDP_PORT,
          SSDP_ADDR
        );
      }
      setTimeout(finish, timeoutMs).unref();
    });
  });
}

function fetchBody(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith("https:") ? https : http).get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for device description`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("device description request timed out")));
    req.on("error", reject);
  });
}

function discoverEndpoints(): Promise<UpnpEndpoint[]> {
  if (globalForUpnp.upnpEndpoints?.length) return Promise.resolve(globalForUpnp.upnpEndpoints);
  if (globalForUpnp.upnpDiscovering) return globalForUpnp.upnpDiscovering;
  globalForUpnp.upnpDiscovering = (async () => {
    const endpoints: UpnpEndpoint[] = [];
    const locations = await ssdpLocations().catch(() => [] as string[]);
    for (const location of locations.slice(0, 4)) {
      const xml = await fetchBody(location).catch(() => null);
      if (!xml) continue;
      const picked = pickUpnpService(xml);
      if (picked) {
        endpoints.push({ ...picked, controlUrl: new URL(picked.controlUrl, location).toString() });
      }
    }
    globalForUpnp.upnpEndpoints = endpoints;
    globalForUpnp.upnpDiscovering = undefined;
    return endpoints;
  })();
  return globalForUpnp.upnpDiscovering;
}

/** Drop the cached gateway when the router has stopped answering — the next
 *  call rediscovers instead of failing forever on a stale control URL. */
function invalidateStaleGateway(detail: string): void {
  if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|timed out|socket hang up/i.test(detail)) {
    globalForUpnp.upnpEndpoints = undefined;
  }
}

function soapRequest(endpoint: UpnpEndpoint, action: string, argsXml: string, timeoutMs = 5000): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const envelope =
      `<?xml version="1.0"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>` +
      `<u:${action} xmlns:u="${endpoint.serviceType}">${argsXml}</u:${action}>` +
      `</s:Body></s:Envelope>`;
    const data = Buffer.from(envelope, "utf8");
    const url = new URL(endpoint.controlUrl);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": `text/xml; charset="utf-8"`,
        "SOAPAction": `"${endpoint.serviceType}#${action}"`,
        "Content-Length": data.length,
      },
      timeout: timeoutMs,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200 && raw.includes(`<u:${action}Response`)) {
          resolve({ ok: true, detail: "" });
          return;
        }
        const errCode = raw.match(/<errorCode>\s*(\d+)\s*<\/errorCode>/)?.[1];
        const errDesc = raw.match(/<errorDescription>\s*([^<]*?)\s*<\/errorDescription>/)?.[1];
        const detail = errCode
          ? `UPnP error ${errCode}${errDesc ? `: ${errDesc}` : ""}`
          : `HTTP ${res.statusCode}`;
        resolve({ ok: false, detail });
      });
    });
    req.on("timeout", () => req.destroy(new Error("SOAP request timed out")));
    req.on("error", (e) => resolve({ ok: false, detail: e.message }));
    req.end(data);
  });
}

function mappingKey(port: number, protocol: Protocol): string {
  return `${port}/${protocol}`;
}

function scheduleRenewal(port: number, protocol: Protocol, description: string): void {
  stopRenewal(port, protocol);
  const timer = setInterval(() => {
    void renewMapping(port, protocol, description);
  }, (LEASE_SECONDS / 3) * 1000);
  timer.unref();
  renewals().set(mappingKey(port, protocol), timer);
}

function stopRenewal(port: number, protocol: Protocol): void {
  const timer = renewals().get(mappingKey(port, protocol));
  if (timer) {
    clearInterval(timer);
    renewals().delete(mappingKey(port, protocol));
  }
}

async function renewMapping(port: number, protocol: Protocol, description: string): Promise<void> {
  const endpoints = globalForUpnp.upnpEndpoints;
  if (!endpoints?.length) return;
  const args = addPortMappingArgs(port, protocol, description);
  for (const endpoint of endpoints) {
    const res = await soapRequest(endpoint, "AddPortMapping", args);
    if (res.ok) return;
    invalidateStaleGateway(res.detail);
  }
  console.error(`[UPnP Error] Lease renewal failed for port ${port} (${protocol}); will retry`);
}

// Maps a port on the router pointing to this computer
export function mapPort(port: number, protocol: Protocol = "UDP", description = "RealmSwap"): Promise<boolean> {
  return (async () => {
    try {
      const endpoints = await discoverEndpoints();
      if (!endpoints.length) {
        console.error(`[UPnP Error] No UPnP gateway answered discovery — port ${port} (${protocol}) not mapped`);
        return false;
      }
      const args = addPortMappingArgs(port, protocol, description);
      let lastDetail = "no gateway accepted the mapping";
      for (const endpoint of endpoints) {
        const res = await soapRequest(endpoint, "AddPortMapping", args);
        if (res.ok) {
          console.log(`[UPnP] Successfully mapped port ${port} (${protocol})`);
          scheduleRenewal(port, protocol, description);
          return true;
        }
        lastDetail = res.detail;
        invalidateStaleGateway(res.detail);
      }
      console.error(`[UPnP Error] Failed to map port ${port} (${protocol}):`, lastDetail);
      return false;
    } catch (e: any) {
      console.error(`[UPnP Exception] Failed to map port ${port}:`, e.message);
      return false;
    }
  })();
}

// Unmaps a port from the router when the server is stopped. IGD error 714
// ("no such mapping") counts as success — it means the router already
// dropped it.
export function unmapPort(port: number, protocol: Protocol = "UDP"): Promise<boolean> {
  return (async () => {
    stopRenewal(port, protocol);
    try {
      const endpoints = await discoverEndpoints();
      if (!endpoints.length) {
        console.error(`[UPnP Error] No UPnP gateway answered discovery — port ${port} (${protocol}) not unmapped`);
        return false;
      }
      const args = deletePortMappingArgs(port, protocol);
      let lastDetail = "no gateway accepted the removal";
      for (const endpoint of endpoints) {
        const res = await soapRequest(endpoint, "DeletePortMapping", args);
        if (res.ok || res.detail.startsWith("UPnP error 714")) {
          console.log(`[UPnP] Successfully unmapped port ${port} (${protocol})`);
          return true;
        }
        lastDetail = res.detail;
        invalidateStaleGateway(res.detail);
      }
      console.error(`[UPnP Error] Failed to unmap port ${port} (${protocol}):`, lastDetail);
      return false;
    } catch (e: any) {
      console.error(`[UPnP Exception] Failed to unmap port ${port}:`, e.message);
      return false;
    }
  })();
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
