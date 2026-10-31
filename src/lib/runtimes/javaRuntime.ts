/**
 * Java runtime provisioning for Java-based game servers (e.g. Minecraft).
 * Pure helpers here are deps-injectable and unit-tested; the impure download/
 * extract path lives in `ensureJava` (Task 2).
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execFile } from "child_process";
import AdmZip from "adm-zip";
import { computePercent } from "@/lib/downloadProgress";

export type JavaPlatform = "windows" | "mac" | "linux";

/** Map a Node platform string to the runtime family the provisioner lays out on disk. */
export function javaPlatformFor(platform: string = process.platform): JavaPlatform {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "mac";
  return "linux";
}

/** Relative path of the java launcher inside a provisioned runtime dir. */
export function javaExeRelPath(platform: string = process.platform): string {
  return javaPlatformFor(platform) === "windows" ? "bin/java.exe" : "bin/java";
}

/** Adoptium Temurin "latest GA JRE" binary endpoint for a major version on the
 *  given platform. Windows assets are .zip; mac/linux assets are .tar.gz.
 *  This URL 302-redirects to the actual asset. */
export function adoptiumUrl(
  major: number,
  platform: string = process.platform,
  arch: string = process.arch
): string {
  const family = javaPlatformFor(platform);
  const os = family === "windows" ? "windows" : family === "mac" ? "mac" : "linux";
  const cpu = arch === "arm64" && family !== "windows" ? "aarch64" : "x64";
  return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${cpu}/jre/hotspot/normal/eclipse`;
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
 *  relative to the extract root), return the sub-directory that contains the java launcher so the
 *  caller can flatten it. Windows zips contain a single top dir with bin/java.exe; mac tarballs
 *  nest it under <top>/Contents/Home/bin/java (the .app bundle layout); linux tarballs use
 *  <top>/bin/java. Returns "" when the launcher is already at the root, or null when not found. */
export function findArchiveJavaRoot(
  entries: string[],
  exists: (relPath: string) => boolean,
  platform: string = process.platform
): string | null {
  const exe = javaExeRelPath(platform);
  if (exists(exe)) return "";
  const macHome = javaPlatformFor(platform) === "mac" ? "Contents/Home" : null;
  if (macHome && exists(`${macHome}/${exe}`)) return macHome;
  const topDirs = new Set<string>();
  for (const e of entries) {
    const seg = e.replace(/\\/g, "/").split("/")[0];
    if (seg) topDirs.add(seg);
  }
  for (const dir of Array.from(topDirs)) {
    if (exists(`${dir}/${exe}`)) return dir;
    if (macHome && exists(`${dir}/${macHome}/${exe}`)) return `${dir}/${macHome}`;
  }
  return null;
}

export interface EnsureJavaOpts {
  dataRoot: string;
  onLog?: (msg: string) => void;
  onProgress?: (percent: number | null, label: string) => void;
  /** Host platform override (tests). Defaults to the process platform. */
  platform?: string;
}

export interface EnsureJavaDeps {
  exists?: (p: string) => boolean;
  provision?: (major: number, cacheDir: string, opts: EnsureJavaOpts) => Promise<void>;
}

/** Absolute path to the cached bundled JRE's java launcher for a major version, or
 *  null when that runtime has not been provisioned yet. Existence check ONLY —
 *  never downloads. Shared by ensureJava (which may provision) and read-only
 *  callers (the install-time boot test) so both resolve the same layout and a
 *  boot test can't silently miss the runtime the real start will use. */
export function cachedJavaExe(
  major: number,
  dataRoot: string,
  exists: (p: string) => boolean = fs.existsSync,
  platform: string = process.platform
): string | null {
  const javaExe = path.join(dataRoot, "runtimes", `jdk-${major}`, javaExeRelPath(platform));
  return exists(javaExe) ? javaExe : null;
}

/** Ensure a Temurin JRE of the given major version is available and return the absolute path to
 *  its java launcher. Downloads + extracts into a shared cache (dataRoot/runtimes/jdk-<major>) on
 *  first use; subsequent calls short-circuit. `deps` is injected in tests; defaults hit the real
 *  network. Provisioned layout matches the host platform (bin/java.exe on Windows, bin/java on
 *  mac/linux) so the same cache dir serves whichever OS the app runs on. */
export async function ensureJava(
  major: number,
  opts: EnsureJavaOpts,
  deps: EnsureJavaDeps = {}
): Promise<string> {
  const exists = deps.exists ?? fs.existsSync;
  const provision = deps.provision ?? defaultProvision;
  const cacheDir = path.join(opts.dataRoot, "runtimes", `jdk-${major}`);
  const cached = cachedJavaExe(major, opts.dataRoot, exists, opts.platform);

  if (cached) {
    opts.onLog?.(`Using cached Java ${major} runtime.`);
    return cached;
  }

  opts.onLog?.(`Java ${major} runtime not found. Downloading…`);
  await provision(major, cacheDir, opts);

  const provisioned = cachedJavaExe(major, opts.dataRoot, exists, opts.platform);
  if (!provisioned) {
    throw new Error(`Java ${major} runtime did not contain ${javaExeRelPath(opts.platform)} after extraction.`);
  }
  return provisioned;
}

// --- Real (impure) provisioning: download -> extract -> flatten into cacheDir ---

async function defaultProvision(major: number, cacheDir: string, opts: EnsureJavaOpts): Promise<void> {
  const runtimesDir = path.dirname(cacheDir);
  fs.mkdirSync(runtimesDir, { recursive: true });

  // Windows assets are .zip; mac/linux assets are .tar.gz (system tar extracts
  // those — bsdtar ships with macOS and most linux distros).
  const family = javaPlatformFor();
  const isZip = family === "windows";
  const suffix = isZip ? ".zip" : ".tar.gz";
  const exe = javaExeRelPath();

  const archivePath = `${cacheDir}.download${suffix}`;
  const tmpDir = `${cacheDir}.extract`;
  // Clear leftovers from any prior failed attempt so we start clean.
  try { fs.rmSync(archivePath, { force: true }); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  let tmpDirConsumed = false;
  try {
    opts.onProgress?.(null, `Downloading Java ${major}…`);
    await downloadFollowingRedirects(adoptiumUrl(major), archivePath, (p) =>
      opts.onProgress?.(
        p,
        p === null ? `Downloading Java ${major}…` : `Downloading Java ${major} ${Math.round(p)}%`
      )
    );

    opts.onProgress?.(null, `Extracting Java ${major}…`);
    if (isZip) {
      await extractZip(archivePath, tmpDir);
    } else {
      await extractTarGz(archivePath, tmpDir);
    }

    const root = findArchiveJavaRoot(fs.readdirSync(tmpDir), (rel) =>
      fs.existsSync(path.join(tmpDir, rel))
    );
    if (root === null) {
      throw new Error(`extracted Java archive did not contain ${exe}`);
    }
    const src = root === "" ? tmpDir : path.join(tmpDir, root);
    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.renameSync(src, cacheDir);
    tmpDirConsumed = src === tmpDir;   // rename moved tmpDir itself into place
  } finally {
    try { fs.rmSync(archivePath, { force: true }); } catch (_) {}
    if (!tmpDirConsumed) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

async function extractTarGz(tarPath: string, destDir: string): Promise<void> {
  // tar won't create the destination (adm-zip does) — make it first.
  fs.mkdirSync(destDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    execFile("tar", ["-xzf", tarPath, "-C", destDir], (err) => {
      if (err) reject(new Error(`Failed to extract Java archive: ${err.message}`));
      else resolve();
    });
  });
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
  } catch (err: any) {
    throw new Error(`Failed to extract Java archive: ${err.message}`);
  }
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
