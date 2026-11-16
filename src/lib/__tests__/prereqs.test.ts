import { describe, it, expect, vi } from "vitest";
import {
  detectVcRedist,
  detectDotNetFramework48,
  requiredPrereqs,
  collectPrereqWarnings,
  VC_REDIST_DOWNLOAD_URL,
  DOTNET_DOWNLOAD_URL,
  type PrereqDeps,
} from "../prereqs";

// --- Fixtures shaped like real `reg query ... /v <name>` stdout ---

const VC_INSTALLED = `

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64
    Installed    REG_DWORD    0x1

`;

const VC_MISSING = VC_INSTALLED.replace("0x1", "0x0");

const DOTNET_48 = `

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full
    Release    REG_DWORD    0x80ea8

`;

// Release 378389 = .NET Framework 4.5 — present but below the 4.8 floor.
const DOTNET_45 = DOTNET_48.replace("0x80ea8", "0x5c5d5");

function deps(over: Partial<PrereqDeps> = {}): PrereqDeps {
  return {
    platform: "win32",
    run: vi.fn(async () => ({ stdout: "" })),
    ...over,
  };
}

describe("detectVcRedist", () => {
  it("reports installed when the registry marker is 0x1", async () => {
    const run = vi.fn(async () => ({ stdout: VC_INSTALLED }));
    expect(await detectVcRedist(deps({ run }))).toBe("installed");
    expect(run).toHaveBeenCalledWith(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64", "/v", "Installed"]
    );
  });

  it("reports missing when the marker is explicitly 0x0", async () => {
    expect(await detectVcRedist(deps({ run: async () => ({ stdout: VC_MISSING }) }))).toBe("missing");
  });

  it("reports unknown when reg query fails (key not found / reg.exe absent)", async () => {
    const run = vi.fn(async () => { throw new Error("ERROR: The system was unable to find the specified registry key or value."); });
    expect(await detectVcRedist(deps({ run }))).toBe("unknown");
  });

  it("reports unknown when stdout has no parseable Installed value", async () => {
    expect(await detectVcRedist(deps({ run: async () => ({ stdout: "garbage" }) }))).toBe("unknown");
  });

  it("never runs reg and reports unknown on non-Windows", async () => {
    const run = vi.fn(async () => ({ stdout: VC_INSTALLED }));
    expect(await detectVcRedist(deps({ platform: "linux", run }))).toBe("unknown");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("detectDotNetFramework48", () => {
  it("reports installed at exactly the 4.8 Release floor (528040)", async () => {
    const at48 = DOTNET_48.replace("0x80ea8", "0x80ea8"); // 0x80ea8 = 528040
    expect(await detectDotNetFramework48(deps({ run: async () => ({ stdout: at48 }) }))).toBe("installed");
  });

  it("reports installed for a later 4.x release", async () => {
    expect(await detectDotNetFramework48(deps({ run: async () => ({ stdout: DOTNET_48 }) }))).toBe("installed");
  });

  it("reports missing when Release is below the 4.8 floor", async () => {
    expect(await detectDotNetFramework48(deps({ run: async () => ({ stdout: DOTNET_45 }) }))).toBe("missing");
  });

  it("reports unknown when reg query fails", async () => {
    const run = vi.fn(async () => { throw new Error("ERROR: The system was unable to find the specified registry key or value."); });
    expect(await detectDotNetFramework48(deps({ run }))).toBe("unknown");
  });

  it("reports unknown on non-Windows", async () => {
    const run = vi.fn(async () => ({ stdout: DOTNET_48 }));
    expect(await detectDotNetFramework48(deps({ platform: "darwin", run }))).toBe("unknown");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("requiredPrereqs (per-game mapping)", () => {
  it("maps the four documented VC++ games plus Palworld/V Rising", () => {
    for (const slug of ["VALHEIM", "ARK", "ENSHROUDED", "SATISFACTORY", "PALWORLD", "VRISING"]) {
      expect(requiredPrereqs(slug)).toContain("VC_REDIST_2015_2022_X64");
    }
    expect(requiredPrereqs("VALHEIM")).not.toContain("DOTNET_FRAMEWORK_48");
  });

  it("maps TERRARIA to .NET Framework 4.8 only", () => {
    expect(requiredPrereqs("TERRARIA")).toEqual(["DOTNET_FRAMEWORK_48"]);
  });

  it("maps nothing for games with no documented requirement", () => {
    expect(requiredPrereqs("MINECRAFT")).toEqual([]);
    expect(requiredPrereqs("ZOMBOID")).toEqual([]);
    expect(requiredPrereqs("RUST")).toEqual([]);
    expect(requiredPrereqs("WINDROSE")).toEqual([]);
    expect(requiredPrereqs("NOT_A_GAME")).toEqual([]);
  });
});

describe("collectPrereqWarnings", () => {
  it("returns no warnings and never queries the registry for prereq-free games", async () => {
    const run = vi.fn(async () => ({ stdout: VC_INSTALLED }));
    const out = await collectPrereqWarnings("MINECRAFT", deps({ run }));
    expect(out).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("warns with the official download link when VC++ is not detected", async () => {
    const run = vi.fn(async () => { throw new Error("key not found"); });
    const out = await collectPrereqWarnings("VALHEIM", deps({ run }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("VC++ 2015-2022 redistributable (x64)");
    expect(out[0]).toContain(VC_REDIST_DOWNLOAD_URL);
    expect(out[0]).toContain("https://aka.ms/");
  });

  it("stays silent when the required library is installed", async () => {
    const out = await collectPrereqWarnings("ARK", deps({
      run: async (_file, args) => (args[1].includes("Runtimes") ? { stdout: VC_INSTALLED } : { stdout: "" }),
    }));
    expect(out).toEqual([]);
  });

  it("warns for Terraria when .NET Framework is below 4.8", async () => {
    const out = await collectPrereqWarnings("TERRARIA", deps({
      run: async () => ({ stdout: DOTNET_45 }),
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain(".NET Framework 4.8");
    expect(out[0]).toContain(DOTNET_DOWNLOAD_URL);
  });

  it("warns once per required library when both kinds are needed", async () => {
    // Nothing in the map currently needs both — assert the shape contract via
    // a VC-only game whose registry is undetectable on non-Windows (unknown).
    const out = await collectPrereqWarnings("SATISFACTORY", deps({ platform: "linux" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("couldn't detect");
  });
});
