/**
 * Java runtime provisioning for Java-based game servers (e.g. Minecraft).
 * Pure helpers here are deps-injectable and unit-tested; the impure download/
 * extract path lives in `ensureJava` (Task 2).
 */

import fs from "fs";
import path from "path";
import https from "https";
import { exec } from "child_process";
import { computePercent } from "@/lib/downloadProgress";

/** Adoptium Temurin "latest GA JRE" binary endpoint for a Windows x64 major version.
 *  This URL 302-redirects to the actual .zip asset. */
export function adoptiumUrl(major: number): string {
  return `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`;
}

/** Parse a JVM `UnsupportedClassVersionError` and return the Java *major* version the jar needs.
 *  The error reports a class-file version (e.g. "class file version 69.0"); the required Java
 *  major is that number minus 44 (52->8, 61->17, 65->21, 69->25). Returns null when no such
 *  marker is present (i.e. the failure was not a Java-version mismatch). */
export function parseRequiredJavaMajor(text: string): number | null {
  if (!text) return null;
  const m = text.match(/class file version (\d+)(?:\.\d+)?/i);
  if (!m) return null;
  const classFileVersion = parseInt(m[1], 10);
  const major = classFileVersion - 44;
  return major > 0 ? major : null;
}

/** Given the top-level entries of an extracted Temurin archive and an existence check (both
 *  relative to the extract root), return the sub-directory that contains "bin/java.exe" so the
 *  caller can flatten it. Temurin zips contain a single top dir like "jdk-21.0.5+11-jre/".
 *  Returns "" when bin/java.exe is already at the root, or null when not found. */
export function findArchiveJavaRoot(
  entries: string[],
  exists: (relPath: string) => boolean
): string | null {
  if (exists("bin/java.exe")) return "";
  const topDirs = new Set<string>();
  for (const e of entries) {
    const seg = e.replace(/\\/g, "/").split("/")[0];
    if (seg) topDirs.add(seg);
  }
  for (const dir of Array.from(topDirs)) {
    if (exists(`${dir}/bin/java.exe`)) return dir;
  }
  return null;
}

export interface EnsureJavaOpts {
  dataRoot: string;
  onLog?: (msg: string) => void;
  onProgress?: (percent: number | null, label: string) => void;
}

export interface EnsureJavaDeps {
  exists?: (p: string) => boolean;
  provision?: (major: number, cacheDir: string, opts: EnsureJavaOpts) => Promise<void>;
}

/** Ensure a Temurin JRE of the given major version is available and return the absolute path to
 *  its java.exe. Downloads + extracts into a shared cache (dataRoot/runtimes/jdk-<major>) on first
 *  use; subsequent calls short-circuit. `deps` is injected in tests; defaults hit the real network. */
export async function ensureJava(
  major: number,
  opts: EnsureJavaOpts,
  deps: EnsureJavaDeps = {}
): Promise<string> {
  const exists = deps.exists ?? fs.existsSync;
  const provision = deps.provision ?? defaultProvision;
  const cacheDir = path.join(opts.dataRoot, "runtimes", `jdk-${major}`);
  const javaExe = path.join(cacheDir, "bin", "java.exe");

  if (exists(javaExe)) {
    opts.onLog?.(`Using cached Java ${major} runtime.`);
    return javaExe;
  }

  opts.onLog?.(`Java ${major} runtime not found. Downloading…`);
  await provision(major, cacheDir, opts);

  if (!exists(javaExe)) {
    throw new Error(`Java ${major} runtime did not contain bin/java.exe after extraction.`);
  }
  return javaExe;
}

// --- Real (impure) provisioning: download -> extract -> flatten into cacheDir ---

async function defaultProvision(major: number, cacheDir: string, opts: EnsureJavaOpts): Promise<void> {
  const runtimesDir = path.dirname(cacheDir);
  fs.mkdirSync(runtimesDir, { recursive: true });

  const zipPath = `${cacheDir}.download.zip`;
  const tmpDir = `${cacheDir}.extract`;
  // Clear leftovers from any prior failed attempt so we start clean.
  try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  let tmpDirConsumed = false;
  try {
    opts.onProgress?.(null, `Downloading Java ${major}…`);
    await downloadFollowingRedirects(adoptiumUrl(major), zipPath, (p) =>
      opts.onProgress?.(
        p,
        p === null ? `Downloading Java ${major}…` : `Downloading Java ${major} ${Math.round(p)}%`
      )
    );

    opts.onProgress?.(null, `Extracting Java ${major}…`);
    await extractZip(zipPath, tmpDir);

    const root = findArchiveJavaRoot(fs.readdirSync(tmpDir), (rel) =>
      fs.existsSync(path.join(tmpDir, rel))
    );
    if (root === null) {
      throw new Error("extracted Java archive did not contain bin/java.exe");
    }
    const src = root === "" ? tmpDir : path.join(tmpDir, root);
    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.renameSync(src, cacheDir);
    tmpDirConsumed = src === tmpDir;   // rename moved tmpDir itself into place
  } finally {
    try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
    if (!tmpDirConsumed) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

function extractZip(zip: string, destDir: string): Promise<void> {
  // PowerShell single-quoted strings escape a quote by doubling it.
  const psQuote = (p: string) => p.replace(/'/g, "''");
  return new Promise((resolve, reject) => {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${psQuote(zip)}' -DestinationPath '${psQuote(destDir)}' -Force"`;
    exec(cmd, (err) =>
      err ? reject(new Error(`Failed to extract Java archive: ${err.message}`)) : resolve()
    );
  });
}

/** https.get that follows 3xx redirects (the Adoptium endpoint redirects to a GitHub asset). */
function downloadFollowingRedirects(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void,
  redirectsLeft = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume(); // drain so the socket frees
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects while downloading Java"));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        resolve(downloadFollowingRedirects(next, dest, onProgress, redirectsLeft - 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`Failed to download Java: status ${status}`));
        return;
      }
      const total = parseInt(res.headers["content-length"] || "", 10);
      let received = 0;
      let lastEmit = 0;
      const file = fs.createWriteStream(dest);
      onProgress?.(computePercent(received, total));
      res.on("data", (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastEmit >= 250) {
          lastEmit = now;
          onProgress?.(computePercent(received, total));
        }
      });
      res.pipe(file);
      file.on("finish", () => {
        onProgress?.(computePercent(received, total));
        file.close(() => resolve());
      });
      file.on("error", (e) => {
        fs.unlink(dest, () => {});
        reject(e);
      });
    });
    req.on("error", (e) => {
      fs.unlink(dest, () => {});
      reject(e);
    });
  });
}
