import { describe, it, expect } from "vitest";
import path from "path";
import {
  adoptiumUrl,
  parseRequiredJavaMajor,
  findArchiveJavaRoot,
  ensureJava,
  cachedJavaExe,
  javaExeRelPath,
  javaPlatformFor,
} from "../javaRuntime";

describe("adoptiumUrl", () => {
  it("builds the Windows x64 GA JRE endpoint for a major version", () => {
    expect(adoptiumUrl(25, "win32")).toBe(
      "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse"
    );
  });
  it("builds the mac endpoints for arm64 and x64 hosts", () => {
    expect(adoptiumUrl(21, "darwin", "arm64")).toBe(
      "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse"
    );
    expect(adoptiumUrl(21, "darwin", "x64")).toBe(
      "https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jre/hotspot/normal/eclipse"
    );
  });
  it("builds the linux endpoint (windows always resolves to x64 hardware)", () => {
    expect(adoptiumUrl(21, "linux", "arm64")).toBe(
      "https://api.adoptium.net/v3/binary/latest/21/ga/linux/aarch64/jre/hotspot/normal/eclipse"
    );
    expect(adoptiumUrl(21, "win32", "arm64")).toBe(
      "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse"
    );
  });
});

describe("javaPlatformFor / javaExeRelPath", () => {
  it("maps node platforms to runtime families and launcher paths", () => {
    expect(javaPlatformFor("win32")).toBe("windows");
    expect(javaPlatformFor("darwin")).toBe("mac");
    expect(javaPlatformFor("linux")).toBe("linux");
    expect(javaExeRelPath("win32")).toBe("bin/java.exe");
    expect(javaExeRelPath("darwin")).toBe("bin/java");
    expect(javaExeRelPath("linux")).toBe("bin/java");
  });
});

describe("parseRequiredJavaMajor", () => {
  it("maps class file version to Java major (classFileVersion - 44)", () => {
    const msg = (v: string) =>
      `java.lang.UnsupportedClassVersionError: net/minecraft/bundler/Main has been compiled by a more recent version of the Java Runtime (class file version ${v}), this version of the Java Runtime only recognizes class file versions up to 65.0`;
    expect(parseRequiredJavaMajor(msg("69.0"))).toBe(25);
    expect(parseRequiredJavaMajor(msg("65.0"))).toBe(21);
    expect(parseRequiredJavaMajor(msg("61.0"))).toBe(17);
  });
  it("returns null when there is no class-file-version marker", () => {
    expect(parseRequiredJavaMajor("some unrelated crash log")).toBeNull();
    expect(parseRequiredJavaMajor("")).toBeNull();
  });
});

describe("findArchiveJavaRoot", () => {
  it("returns the single top dir that contains bin/java.exe", () => {
    const entries = ["jdk-25+9-jre", "jdk-25+9-jre/bin/java.exe"];
    const exists = (p: string) => p === "jdk-25+9-jre/bin/java.exe";
    expect(findArchiveJavaRoot(entries, exists, "win32")).toBe("jdk-25+9-jre");
  });
  it("returns empty string when java.exe is already at the root", () => {
    expect(findArchiveJavaRoot(["bin/java.exe"], (p) => p === "bin/java.exe", "win32")).toBe("");
  });
  it("returns null when java.exe is absent", () => {
    expect(findArchiveJavaRoot(["foo", "foo/bar"], () => false, "win32")).toBeNull();
  });
  it("finds bin/java in a linux tarball top dir", () => {
    const entries = ["jdk-21+9-jre", "jdk-21+9-jre/bin/java"];
    const exists = (p: string) => p === "jdk-21+9-jre/bin/java";
    expect(findArchiveJavaRoot(entries, exists, "linux")).toBe("jdk-21+9-jre");
  });
  it("flattens the macOS .app bundle layout to Contents/Home", () => {
    const entries = [
      "jdk-25+9-jre",
      "jdk-25+9-jre/Contents",
      "jdk-25+9-jre/Contents/Home",
      "jdk-25+9-jre/Contents/Home/bin/java",
    ];
    const exists = (p: string) => p === "jdk-25+9-jre/Contents/Home/bin/java";
    expect(findArchiveJavaRoot(entries, exists, "darwin")).toBe("jdk-25+9-jre/Contents/Home");
  });
});

describe("ensureJava", () => {
  const javaPath = (root: string, major: number, exe = "java.exe") =>
    path.join(root, "runtimes", `jdk-${major}`, "bin", exe);

  it("cachedJavaExe returns the bundled path only when provisioned, without downloading", () => {
    expect(cachedJavaExe(21, "/data", (p) => p === javaPath("/data", 21), "win32")).toBe(
      javaPath("/data", 21)
    );
    expect(cachedJavaExe(21, "/data", () => false, "win32")).toBeNull();
    expect(cachedJavaExe(17, "/data", (p) => p === javaPath("/data", 21), "win32")).toBeNull();
  });

  it("cachedJavaExe resolves bin/java (no .exe) on mac and linux", () => {
    expect(cachedJavaExe(21, "/data", (p) => p === javaPath("/data", 21, "java"), "darwin")).toBe(
      javaPath("/data", 21, "java")
    );
    expect(cachedJavaExe(21, "/data", (p) => p === javaPath("/data", 21, "java"), "linux")).toBe(
      javaPath("/data", 21, "java")
    );
    expect(cachedJavaExe(21, "/data", (p) => p === javaPath("/data", 21), "darwin")).toBeNull();
  });

  it("returns the cached java.exe without provisioning when already present", async () => {
    let provisioned = false;
    const result = await ensureJava(
      25,
      { dataRoot: "/data", platform: "win32" },
      {
        exists: (p) => p === javaPath("/data", 25),
        provision: async () => {
          provisioned = true;
        },
      }
    );
    expect(result).toBe(javaPath("/data", 25));
    expect(provisioned).toBe(false);
  });

  it("provisions when missing, then returns the path", async () => {
    const calls: number[] = [];
    let present = false;
    const result = await ensureJava(
      21,
      { dataRoot: "/d", platform: "win32" },
      {
        exists: () => present,
        provision: async (major) => {
          calls.push(major);
          present = true;
        },
      }
    );
    expect(calls).toEqual([21]);
    expect(result).toBe(javaPath("/d", 21));
  });

  it("throws when provisioning leaves no java.exe", async () => {
    await expect(
      ensureJava(21, { dataRoot: "/d" }, {
        exists: () => false,
        provision: async () => {},
      })
    ).rejects.toThrow(/did not contain/i);
  });
});
