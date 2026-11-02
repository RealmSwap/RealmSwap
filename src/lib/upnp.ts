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
 *
 * Discovery probes SSDP from every routable interface: Windows picks
 * multicast egress by the 224/4 route metric, and on machines with virtual
 * adapters (VirtualBox, VMware, Tailscale, Hyper-V) that race is regularly
 * lost to an adapter the router never sees — UPnP then "stops working" until
 * the metric table happens to change. The mapping's internal client is the
 * local address on the gateway's own subnet, not whichever NIC
 * os.networkInterfaces() happens to list first.
 */

type Protocol = "TCP" | "UDP";

interface UpnpEndpoint {
  serviceType: string;
  controlUrl: string;
  /** The local address on the gateway's subnet — the NewInternalClient the
   *  router will actually route back to this machine. */
  internalClient: string;
}

/** What the device XML gives us before the gateway's subnet is known. */
interface PickedService {
  serviceType: string;
  controlUrl: string;
}

interface RenewalState {
  port: number;
  protocol: Protocol;
  description: string;
  internalClient: string;
}

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const LEASE_SECONDS = 3600;

const globalForUpnp = globalThis as unknown as {
  upnpEndpoints?: UpnpEndpoint[];
  upnpDiscovering?: Promise<UpnpEndpoint[]>;
  upnpRenewals?: Map<string, RenewalState & { timer: NodeJS.Timeout }>;
};

function renewals(): Map<string, RenewalState & { timer: NodeJS.Timeout }> {
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
export function pickUpnpService(xml: string): PickedService | null {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/g) ?? [];
  const candidates: PickedService[] = [];
  for (const block of blocks) {
    const serviceType = block.match(/<serviceType>\s*([^<]+?)\s*<\/serviceType>/)?.[1];
    const controlUrl = block.match(/<controlURL>\s*([^<]+?)\s*<\/controlURL>/)?.[1];
    if (!serviceType || !controlUrl) continue;
    if (/WAN(IP|PPP)Connection/.test(serviceType)) candidates.push({ serviceType, controlUrl });
  }
  const rank = (e: PickedService) =>
    e.serviceType.includes("WANIPConnection:2") ? 0 :
    e.serviceType.includes("WANIPConnection:1") ? 1 :
    e.serviceType.includes("WANPPPConnection") ? 2 : 3;
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] ?? null;
}

/** The AddPortMapping argument block; exported for tests. Call sites pass
 *  the gateway-subnet address discovered with the endpoint. */
export function addPortMappingArgs(
  port: number,
  protocol: Protocol,
  description: string,
  internalClient: string = getLanIP() ?? "127.0.0.1"
): string {
  return (
    `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort>` +
    `<NewProtocol>${protocol}</NewProtocol><NewInternalPort>${port}</NewInternalPort>` +
    `<NewInternalClient>${escapeXml(internalClient)}</NewInternalClient><NewEnabled>1</NewEnabled>` +
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

/** One M-SEARCH volley sent from a specific local interface (or the OS
 *  default route when null); resolves with the LOCATION URLs that answered. */
function ssdpProbe(bindIp: string | null, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    const sock = dgram.createSocket({ type: "udp4" });
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
    const onBound = () => {
      try {
        if (bindIp) sock.setMulticastInterface(bindIp);
      } catch { /* interface may have vanished mid-probe */ }
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
    };
    if (bindIp) sock.bind({ address: bindIp }, onBound);
    else sock.bind(onBound);
  });
}

function ssdpLocations(timeoutMs = 3500): Promise<string[]> {
  // Probe from EVERY routable interface, not just the OS default: multicast
  // egress follows the 224/4 route metric, and a virtual adapter can win
  // that race on machines where UPnP otherwise reads as dead.
  const probes = candidateLanIPs().map((ip) => ssdpProbe(ip, timeoutMs));
  probes.push(ssdpProbe(null, timeoutMs));
  return Promise.all(probes).then((sets) => {
    const merged = new Set<string>();
    for (const set of sets) for (const loc of set) merged.add(loc);
    return Array.from(merged);
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
        const controlUrl = new URL(picked.controlUrl, location).toString();
        endpoints.push({
          serviceType: picked.serviceType,
          controlUrl,
          internalClient: localIpForGateway(new URL(controlUrl).hostname),
        });
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

function scheduleRenewal(port: number, protocol: Protocol, description: string, internalClient: string): void {
  stopRenewal(port, protocol);
  const timer = setInterval(() => {
    const state = renewals().get(mappingKey(port, protocol));
    if (state) void renewMapping(state);
  }, (LEASE_SECONDS / 3) * 1000);
  timer.unref();
  renewals().set(mappingKey(port, protocol), { port, protocol, description, internalClient, timer });
}

function stopRenewal(port: number, protocol: Protocol): void {
  const state = renewals().get(mappingKey(port, protocol));
  if (state) {
    clearInterval(state.timer);
    renewals().delete(mappingKey(port, protocol));
  }
}

async function renewMapping(state: RenewalState): Promise<void> {
  const endpoints = globalForUpnp.upnpEndpoints;
  if (!endpoints?.length) return;
  const args = addPortMappingArgs(state.port, state.protocol, state.description, state.internalClient);
  for (const endpoint of endpoints) {
    const res = await soapRequest(endpoint, "AddPortMapping", args);
    if (res.ok) return;
    invalidateStaleGateway(res.detail);
  }
  console.error(`[UPnP Error] Lease renewal failed for port ${state.port} (${state.protocol}); will retry`);
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
      let lastDetail = "no gateway accepted the mapping";
      for (const endpoint of endpoints) {
        const res = await soapRequest(endpoint, "AddPortMapping", addPortMappingArgs(port, protocol, description, endpoint.internalClient));
        if (res.ok) {
          console.log(`[UPnP] Successfully mapped port ${port} (${protocol})`);
          scheduleRenewal(port, protocol, description, endpoint.internalClient);
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

/** Every routable local IPv4 (virtual adapters included, link-local
 *  excluded) — SSDP is probed from each so a virtual adapter winning the
 *  multicast route can't hide the gateway. */
export function candidateLanIPs(): string[] {
  const ips: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254.")) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

/** Same-subnet test against an explicit netmask (os reports it, so no /24
 *  guessing); exported for tests. */
export function addressInSameSubnet(gatewayHost: string, address: string, netmask: string): boolean {
  const parse = (ip: string): number | null => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  };
  const gateway = parse(gatewayHost);
  const addr = parse(address);
  const mask = parse(netmask);
  if (gateway === null || addr === null || mask === null) return false;
  return (addr & mask) === (gateway & mask);
}

/** The local address on the gateway's own subnet — the AddPortMapping
 *  internal client the router will actually route back to. Falls back to
 *  getLanIP() when no interface shares the gateway's subnet. */
export function localIpForGateway(gatewayHost: string): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal && iface.netmask &&
          addressInSameSubnet(gatewayHost, iface.address, iface.netmask)) {
        return iface.address;
      }
    }
  }
  return getLanIP() ?? "127.0.0.1";
}
