import { describe, it, expect, vi } from "vitest";
import { listBoundSockets, parseLsof, parseProcNet, parseWindowsNetstat } from "@/lib/boundPorts";

/**
 * The OS-level answer to "is anything bound to this port?" that replaced the
 * TCP-connect probe in the connectivity troubleshooter. Each parser is pinned
 * to a realistic capture of its tool's output.
 */

const WINDOWS_NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032
  TCP    0.0.0.0:25565          0.0.0.0:0              LISTENING       4120
  TCP    192.168.1.42:49722     140.82.112.3:443       ESTABLISHED     7788
  TCP    127.0.0.1:3000         127.0.0.1:52001        TIME_WAIT       0
  TCP    [::]:135               [::]:0                 LISTENING       1032
  TCP    0.0.0.0:28016          0.0.0.0:0              ABHÖREN         9001
  UDP    0.0.0.0:15637          *:*                                    6204
  UDP    0.0.0.0:28015          *:*                                    9001
  UDP    [::1]:1900             *:*                                    2345
  UDP    192.168.1.42:5353      *:*                                    411
`;

const LSOF_TCP = `COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      91262 codymills   13u  IPv6 0xcae0cff089549484      0t0  TCP *:3000 (LISTEN)
java       4120 codymills   77u  IPv6 0x00000000deadbeef      0t0  TCP *:25565 (LISTEN)
node      91262 codymills   20u  IPv4 0x00000000cafebabe      0t0  TCP 127.0.0.1:3000->127.0.0.1:52000 (ESTABLISHED)
`;

const LSOF_UDP = `COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
rapportd    583 codymills    4u  IPv4 0x0000000000000001      0t0  UDP *:51234
valheim_s  7001 codymills   12u  IPv4 0x0000000000000002      0t0  UDP *:2456
mDNSRespo   300 _mdnsresponder 8u IPv4 0x0000000000000003    0t0  UDP *:5353
chrome     2222 codymills   40u  IPv4 0x0000000000000004      0t0  UDP 192.168.1.5:61000->8.8.8.8:53
`;

const PROC_UDP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops
   0: 00000000:3D15 00000000:0000 07 00000000:00000000 00:00000000 00000000  1000        0 12345 2 0000000000000000 0
   1: 0100007F:14E9 00000000:0000 07 00000000:00000000 00:00000000 00000000   101        0 12346 2 0000000000000000 0
`;

const PROC_TCP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:63DD 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 11111 1 0000000000000000 100 0 0 10 0
   1: 0100007F:0BB8 0100007F:CB30 01 00000000:00000000 00:00000000 00000000  1000        0 22222 1 0000000000000000 20 4 30 10 -1
`;

const PROC_TCP6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:0BB8 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 33333 1 0000000000000000 100 0 0 10 0
`;

const ports = (s: { protocol: string; port: number }[], protocol: string) =>
  s.filter((x) => x.protocol === protocol).map((x) => x.port).sort((a, b) => a - b);

describe("parseWindowsNetstat", () => {
  const sockets = parseWindowsNetstat(WINDOWS_NETSTAT);

  it("keeps TCP listeners (by zero foreign endpoint, so localized State words work) and drops connections", () => {
    expect(ports(sockets, "TCP")).toEqual([135, 135, 25565, 28016]);
  });

  it("treats every UDP row as bound, including IPv6 and interface-specific binds", () => {
    expect(ports(sockets, "UDP")).toEqual([1900, 5353, 15637, 28015]);
  });

  it("carries the owning pid from the right column for each protocol", () => {
    expect(sockets.find((s) => s.port === 25565)?.pid).toBe(4120);
    expect(sockets.find((s) => s.port === 15637)?.pid).toBe(6204);
  });
});

describe("parseLsof", () => {
  it("TCP rows count only when (LISTEN)", () => {
    const sockets = parseLsof(LSOF_TCP);
    expect(ports(sockets, "TCP")).toEqual([3000, 25565]);
    expect(sockets.find((s) => s.port === 25565)?.pid).toBe(4120);
  });

  it("UDP rows count whether wildcard-bound or connected (local side only)", () => {
    const sockets = parseLsof(LSOF_UDP);
    expect(ports(sockets, "UDP")).toEqual([2456, 5353, 51234, 61000]);
    expect(sockets.find((s) => s.port === 2456)?.pid).toBe(7001);
  });

  it("an empty answer parses to no sockets", () => {
    expect(parseLsof("")).toEqual([]);
  });
});

describe("parseProcNet", () => {
  it("decodes hex ports and keeps only LISTEN (0A) for TCP", () => {
    expect(ports(parseProcNet(PROC_TCP, "TCP"), "TCP")).toEqual([25565]);
    expect(ports(parseProcNet(PROC_TCP6, "TCP"), "TCP")).toEqual([3000]);
  });

  it("keeps every UDP row", () => {
    expect(ports(parseProcNet(PROC_UDP, "UDP"), "UDP")).toEqual([5353, 15637]);
  });
});

describe("listBoundSockets", () => {
  it("Windows: one netstat -ano call", async () => {
    const exec = vi.fn(async () => WINDOWS_NETSTAT);
    const sockets = await listBoundSockets({ platform: "win32", exec });
    expect(exec).toHaveBeenCalledWith("netstat", ["-ano"]);
    expect(ports(sockets!, "UDP")).toContain(15637);
  });

  it("macOS: TCP listeners and UDP sockets from two lsof calls", async () => {
    const exec = vi.fn(async (_cmd: string, args: string[]) => (args.includes("-iUDP") ? LSOF_UDP : LSOF_TCP));
    const sockets = await listBoundSockets({ platform: "darwin", exec });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(ports(sockets!, "TCP")).toEqual([3000, 25565]);
    expect(ports(sockets!, "UDP")).toContain(2456);
  });

  it("Linux: reads the four /proc tables and tolerates a missing v6 table", async () => {
    const readFile = vi.fn(async (p: string) => {
      if (p === "/proc/net/tcp") return PROC_TCP;
      if (p === "/proc/net/udp") return PROC_UDP;
      throw new Error("ENOENT");
    });
    const sockets = await listBoundSockets({ platform: "linux", readFile });
    expect(ports(sockets!, "TCP")).toEqual([25565]);
    expect(ports(sockets!, "UDP")).toEqual([5353, 15637]);
  });

  it("Linux with no /proc at all is 'can't tell', not 'nothing bound'", async () => {
    const readFile = vi.fn(async () => { throw new Error("ENOENT"); });
    expect(await listBoundSockets({ platform: "linux", readFile })).toBeNull();
  });

  it("a failing tool or an unsupported platform yields null", async () => {
    const exec = vi.fn(async () => { throw new Error("spawn netstat ENOENT"); });
    expect(await listBoundSockets({ platform: "win32", exec })).toBeNull();
    expect(await listBoundSockets({ platform: "freebsd" as NodeJS.Platform, exec })).toBeNull();
  });
});
