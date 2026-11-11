import { describe, it, expect } from "vitest";
import { classifyReport, nextConnectivityState, LOST_AFTER_BAD_CHECKS } from "../connectivityRules";
import type { ConnectivityReport } from "../connectivityCheck";

// What a connectivity report means for "can friends outside this network get
// in", and when a change in that is worth telling the owner about.

const tunnelled = { tunnelEnabled: true, enableUpnp: false, tunnelUrl: "tunnel.example:1234" };
const lanOnly = { tunnelEnabled: false, enableUpnp: false, tunnelUrl: null };
const upnpOnly = { tunnelEnabled: false, enableUpnp: true, tunnelUrl: null };

const report = (over: { server?: string; listen?: string; router?: string } = {}): ConnectivityReport => {
  const status = (id: string, value?: string) => value ?? (id === "firewall" ? "warn" : "ok");
  return {
    overall: "ready",
    checks: [
      { id: "server", label: "Server status", status: status("server", over.server) as any, detail: "" },
      { id: "listen", label: "Game is listening", status: status("listen", over.listen) as any, detail: over.listen === "fail" ? "nothing bound" : "" },
      { id: "router", label: "Router / outside access", status: status("router", over.router) as any, detail: over.router === "warn" ? "address saved but no agent" : "" },
      { id: "firewall", label: "Windows Firewall", status: "warn", detail: "" },
    ],
  };
};

const fresh = { everReachable: false, badStreak: 0, alerted: false };

describe("classifyReport", () => {
  it("a healthy tunnelled server is ok", () => {
    expect(classifyReport(report(), tunnelled)).toEqual({ verdict: "ok", problem: null });
  });

  it("an advertised address with no agent behind it is bad, not merely a warning", () => {
    const { verdict, problem } = classifyReport(report({ router: "warn" }), tunnelled);
    expect(verdict).toBe("bad");
    expect(problem?.id).toBe("router");
  });

  it("a router refusal or a dead listener is bad", () => {
    expect(classifyReport(report({ router: "fail" }), upnpOnly).verdict).toBe("bad");
    expect(classifyReport(report({ listen: "fail" }), tunnelled).verdict).toBe("bad");
  });

  it("a LAN-only server is nobody's incident", () => {
    expect(classifyReport(report({ router: "fail" }), lanOnly).verdict).toBe("not-applicable");
  });

  it("a stopped server is skipped", () => {
    expect(classifyReport(report({ server: "fail" }), tunnelled).verdict).toBe("unknown");
  });

  it("router warnings that are not outages stay unknown (no attempt recorded, agent nodes)", () => {
    const warnRouter = report({ router: "warn" });
    warnRouter.checks[2] = { ...warnRouter.checks[2], detail: "UPnP is enabled, but RealmSwap hasn't recorded a mapping attempt yet." };
    expect(classifyReport(warnRouter, upnpOnly).verdict).toBe("unknown");
  });
});

describe("nextConnectivityState", () => {
  it("tells the owner only after the loss has persisted, and only once", () => {
    let memory = { ...fresh };
    memory.everReachable = true;

    memory = nextConnectivityState(memory, "bad").memory; // first bad check
    expect(memory.badStreak).toBe(1);
    expect(memory.alerted).toBe(false);

    const second = nextConnectivityState(memory, "bad"); // persisted
    expect(second.event).toBe("lost");
    memory = second.memory;
    expect(memory.alerted).toBe(true);

    const third = nextConnectivityState(memory, "bad");
    expect(third.event).toBeNull();
  });

  it("never reports a server that never had a public path", () => {
    let memory = { ...fresh };
    for (let i = 0; i < LOST_AFTER_BAD_CHECKS + 2; i++) {
      const step = nextConnectivityState(memory, "bad");
      memory = step.memory;
      expect(step.event).toBeNull();
    }
  });

  it("recovery clears the alarm and reports it exactly once", () => {
    let memory = { everReachable: true, badStreak: 2, alerted: true };
    const back = nextConnectivityState(memory, "ok");
    expect(back.event).toBe("restored");
    memory = back.memory;
    expect(memory).toEqual({ everReachable: true, badStreak: 0, alerted: false });
    expect(nextConnectivityState(memory, "ok").event).toBeNull();
  });

  it("an unknown verdict changes nothing", () => {
    const memory = { everReachable: true, badStreak: 1, alerted: false };
    expect(nextConnectivityState(memory, "unknown")).toEqual({ memory, event: null });
  });

  it("the path being switched off resets the run's memory", () => {
    const memory = { everReachable: true, badStreak: 2, alerted: true };
    const step = nextConnectivityState(memory, "not-applicable");
    expect(step.event).toBeNull();
    expect(step.memory).toEqual(fresh);
    // ...so re-enabling it later cannot report a loss from the old run
    const reenabled = nextConnectivityState(step.memory, "bad");
    expect(reenabled.event).toBeNull();
  });

  it("a single bad check rides out and recovers quietly", () => {
    let memory = { everReachable: true, badStreak: 0, alerted: false };
    memory = nextConnectivityState(memory, "bad").memory;
    const back = nextConnectivityState(memory, "ok");
    expect(back.event).toBeNull(); // never told, so nothing to retract
    expect(back.memory.badStreak).toBe(0);
  });
});
