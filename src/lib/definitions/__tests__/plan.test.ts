import { describe, it, expect } from "vitest";
import { planInstall, planConfigFiles, planLaunch, planPorts } from "../plan";

const ctx: any = { name: "Viking Realm", nameSanitized: "Viking_Realm", password: "secret", port: 2456, ram: 6 };
const spec: any = {
  install: { appId: "896660", installSubDir: "valheim-server", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 },
  launch: { executable: "valheim_server.exe", args: ["-port", "{port}", { value: ["-pass", "{password}"], includeWhen: "password" }], cwdSubDir: "valheim-server" },
  defaultPort: 2456, params: [],
  configFiles: [{ path: "server.properties", strategy: "template", template: "motd={name}\n" }],
  ports: [{ protocol: "UDP", port: "{port}" }, { protocol: "UDP", port: "2457" }],
};

describe("planners", () => {
  it("plans a steamcmd install", () => {
    expect(planInstall(spec, "STEAMCMD")).toEqual({
      method: "STEAMCMD", appId: "896660", installSubDir: "valheim-server",
      checkFile: "valheim_server.exe", requiredDiskGB: 2.5,
    });
  });
  it("renders template config files", () => {
    expect(planConfigFiles(spec, ctx)).toEqual([{ relPath: "server.properties", strategy: "template", content: "motd=Viking Realm\n" }]);
  });
  it("renders launch args including conditional groups", () => {
    const p = planLaunch(spec, ctx);
    expect(p.executable).toBe("valheim_server.exe");
    expect(p.args).toEqual(["-port", "2456", "-pass", "secret"]);
    expect(p.cwdSubDir).toBe("valheim-server");
  });
  it("renders ports to numbers", () => {
    expect(planPorts(spec, ctx)).toEqual([{ protocol: "UDP", port: 2456 }, { protocol: "UDP", port: 2457 }]);
  });
});
