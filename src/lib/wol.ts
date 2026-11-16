import dgram from "dgram";
import os from "os";

/**
 * Wake-on-LAN for agent nodes: the same wake-before-game-night treatment the
 * host PC gets (wakePlan/wakeScheduler), for the second machine in the
 * basement that is asleep when a scheduled or manual start fires. A magic
 * packet is 6× 0xFF followed by the target's MAC 16 times, broadcast on the
 * LAN — the sleeping NIC wakes the machine when it matches.
 */

export function buildMagicPacket(mac: string): Buffer {
  const clean = mac.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length !== 12) throw new Error(`Not a MAC address: '${mac}'`);
  const bytes = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 6; j++) {
      bytes.writeUInt8(parseInt(clean.slice(j * 2, j * 2 + 2), 16), 6 + i * 6 + j);
    }
  }
  return bytes;
}

/**
 * Broadcast the packet a few times (a sleeping machine's first seconds on the
 * wire are lossy). `host` overrides the target — most NICs only take broadcast,
 * so the default is the global broadcast; a subnet-directed broadcast
 * (e.g. 192.168.1.255) works across some routed setups.
 */
export async function sendWakeOnLan(
  mac: string,
  opts: { host?: string; port?: number; repeats?: number } = {}
): Promise<void> {
  const packet = buildMagicPacket(mac);
  const host = opts.host ?? "255.255.255.255";
  const port = opts.port ?? 9;
  const repeats = opts.repeats ?? 3;

  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.setBroadcast(true);
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => { try { socket.close(); } catch { /* already closed */ } reject(err); };
    // Bind an ephemeral port; on a host with several interfaces, binding the
    // default outgoing one keeps the broadcast on the LAN the app is on.
    socket.bind(() => {
      socket.once("error", fail);
      let sent = 0;
      const sendNext = () => {
        socket.send(packet, port, host, (err) => {
          if (err) return fail(err);
          if (++sent >= repeats) {
            try { socket.close(); } catch { /* already closed */ }
            resolve();
          } else {
            setTimeout(sendNext, 200);
          }
        });
      };
      sendNext();
    });
  });
}

/**
 * The broadcast address of the dashboard's own primary subnet, derived from
 * the LAN address the way agents report theirs. Used before the global
 * broadcast: some routers drop global broadcasts but forward directed ones.
 */
export function subnetBroadcastHint(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        const parts = iface.address.split(".");
        return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
      }
    }
  }
  return null;
}

/** Send to the subnet-directed broadcast first, then the global one. */
export async function wakeNode(mac: string, opts: { repeats?: number } = {}): Promise<void> {
  const subnet = subnetBroadcastHint();
  if (subnet) await sendWakeOnLan(mac, { host: subnet, repeats: opts.repeats });
  await sendWakeOnLan(mac, opts);
}
