import { describe, it, expect } from "vitest";
import path from "path";
import { adoptiumUrl, parseRequiredJavaMajor, findArchiveJavaRoot, ensureJava, cachedJavaExe } from "../javaRuntime";

describe("adoptiumUrl", () => {
  it("builds the Windows x64 GA JRE endpoint for a major version", () => {
    expect(adoptiumUrl(25)).toBe(
      "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse"
    );
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
    expect(findArchiveJavaRoot(entries, exists)).toBe("jdk-25+9-jre");
  });
  it("returns empty string when java.exe is already at the root", () => {
    expect(findArchiveJavaRoot(["bin/java.exe"], (p) => p === "bin/java.exe")).toBe("");
  });
  it("returns null when java.exe is absent", () => {
    expect(findArchiveJavaRoot(["foo", "foo/bar"], () => false)).toBeNull();
  });
});

describe("ensureJava", () => {
  const javaPath = (root: string, major: number) =>
    path.join(root, "runtimes", `jdk-${major}`, "bin", "java.exe");

  it("cachedJavaExe returns the bundled path only when provisioned, without downloading", () => {
    expect(cachedJavaExe(21, "/data", (p) => p === javaPath("/data", 21))).toBe(javaPath("/data", 21));
    expect(cachedJavaExe(21, "/data", () => false)).toBeNull();
    expect(cachedJavaExe(17, "/data", (p) => p === javaPath("/data", 21))).toBeNull();
  });


  it("returns the cached java.exe without provisioning when already present", async () => {
    let provisioned = false;
    const result = await ensureJava(
      25,
      { dataRoot: "/data" },
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
      { dataRoot: "/d" },
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
