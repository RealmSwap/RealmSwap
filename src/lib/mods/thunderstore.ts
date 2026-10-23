/**
 * Thunderstore API helpers: community package-index fetching plus the
 * dependency resolver used when installing a package — version-pin aware,
 * cycle-safe, and honest about what it could not resolve.
 *
 * Dependency strings look like "owner-package_name-1.2.3": the id itself is
 * "owner-package_name" (owner and name may contain dashes), so the version
 * has to be split off at the last dash followed by a digit. Version specs
 * are prefixes per Thunderstore's manifest rules: "1.4" accepts any 1.4.x,
 * "1" accepts any 1.x.x.
 */

import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { safeJoin } from "../safePath";
import { safePackPath } from "./mrpack";

export interface ThunderstoreVersion {
  version_number: string;
  download_url: string;
  dependencies: string[];
  description: string;
  icon: string;
}

export interface ThunderstorePackage {
  full_name: string;
  name: string;
  owner: string;
  is_deprecated: boolean;
  rating_score: number;
  date_updated: string;
  categories: string[];
  versions: ThunderstoreVersion[];
}

/** Version lists come newest-first from the API; the resolver relies on it. */
export function newestVersion(pkg: ThunderstorePackage): ThunderstoreVersion | null {
  return pkg.versions?.[0] ?? null;
}

export function findVersionEntry(
  pkg: ThunderstorePackage,
  ref: { versionNumber?: string; downloadUrl?: string }
): ThunderstoreVersion | null {
  if (ref.versionNumber) {
    const byNumber = pkg.versions.find((v) => v.version_number === ref.versionNumber);
    if (byNumber) return byNumber;
  }
  if (ref.downloadUrl) {
    const byUrl = pkg.versions.find((v) => v.download_url === ref.downloadUrl);
    if (byUrl) return byUrl;
  }
  return null;
}

/** Split "owner-package-1.2.3" into its id and version spec. */
export function parseDependencyString(dep: string): { packageId: string; versionSpec: string } | null {
  const match = /^(.+)-(\d[\w.+\-]*)$/.exec(dep);
  if (!match) return null;
  return { packageId: match[1], versionSpec: match[2] };
}

/** True when a concrete version number satisfies a dependency version spec. */
export function matchesSpec(versionNumber: string, spec: string): boolean {
  if (!versionNumber.startsWith(spec)) return false;
  if (versionNumber.length === spec.length) return true;
  const next = versionNumber[spec.length];
  return next === "." || next === "-"; // "1.4" matches "1.4.2", not "1.40.0"
}

/** Newest version (API order) whose number satisfies the spec. */
export function pickVersionForSpec(
  pkg: ThunderstorePackage,
  spec: string
): ThunderstoreVersion | null {
  return pkg.versions.find((v) => matchesSpec(v.version_number, spec)) ?? null;
}

/**
 * The BepInEx core packs are framework, not content: the install route
 * provisions the core itself (and pins its version), so deps on any
 * "BepInExPack" package are skipped rather than double-installed.
 */
export function isBepInExCore(packageId: string): boolean {
  return packageId.includes("BepInExPack");
}

export interface ResolvedDependency {
  packageId: string;
  name: string;
  version: string;
  downloadUrl: string;
}

/**
 * Walk the required-dependency graph from a root package version and return
 * the packages that still need installing, dependency-first. Pure: the index
 * lookup and the installed-set predicate are injected so the walk is
 * unit-testable without network. Depth-capped and cycle-safe. Unresolvable
 * deps are reported, never silently dropped.
 */
export function collectDependencies(
  root: { packageId: string; version: ThunderstoreVersion },
  lookup: (packageId: string) => ThunderstorePackage | null,
  alreadyInstalled: (packageId: string) => boolean
): { order: ResolvedDependency[]; missing: string[] } {
  const order: ResolvedDependency[] = [];
  const missing: string[] = [];
  const seen = new Set<string>([root.packageId]);
  let level = [root];
  const MAX_DEPTH = 12;

  for (let depth = 0; level.length > 0 && depth < MAX_DEPTH; depth++) {
    const next: { packageId: string; version: ThunderstoreVersion }[] = [];
    for (const current of level) {
      for (const depString of current.version.dependencies ?? []) {
        const parsed = parseDependencyString(depString);
        if (!parsed) {
          missing.push(depString);
          continue;
        }
        const { packageId, versionSpec } = parsed;
        if (seen.has(packageId)) continue;
        seen.add(packageId);
        if (isBepInExCore(packageId)) continue; // provisioned by the installer itself
        if (alreadyInstalled(packageId)) continue;

        const pkg = lookup(packageId);
        const depVersion = pkg ? pickVersionForSpec(pkg, versionSpec) : null;
        if (!pkg || !depVersion) {
          missing.push(depString);
          continue;
        }
        order.push({
          packageId,
          name: pkg.name,
          version: depVersion.version_number,
          downloadUrl: depVersion.download_url,
        });
        next.push({ packageId, version: depVersion });
      }
    }
    level = next;
  }

  return { order, missing };
}

/**
 * Extract a Thunderstore package zip into a per-package folder. Third-party
 * archives: every entry is re-anchored under destDir (traversal rejected)
 * instead of trusting zip paths.
 */
export function extractThunderstorePackage(zip: AdmZip, destDir: string): number {
  let count = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const target = safeJoin(destDir, safePackPath(entry.entryName));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    count++;
  }
  return count;
}

/**
 * Fetch (and cache, 10 min) the full package index for a community. Shared
 * by search and install so they don't refetch the multi-megabyte index.
 */
const indexCache = new Map<string, { packages: ThunderstorePackage[]; fetchedAt: number }>();
const INDEX_TTL = 10 * 60 * 1000;

export function communityForGame(game: string): string | null {
  const communities: Record<string, string> = {
    VALHEIM: "valheim",
    VRISING: "v-rising",
    PALWORLD: "palworld",
  };
  return communities[game.toUpperCase()] ?? null;
}

export async function fetchCommunityIndex(
  community: string,
  force = false
): Promise<ThunderstorePackage[]> {
  const cached = indexCache.get(community);
  if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL) {
    return cached.packages;
  }
  const res = await fetch(`https://${community}.thunderstore.io/api/v1/package/`);
  if (!res.ok) {
    if (cached) return cached.packages; // stale beats nothing
    throw new Error(`Thunderstore request failed (${res.status}) for ${community}.`);
  }
  const packages = (await res.json()) as ThunderstorePackage[];
  indexCache.set(community, { packages, fetchedAt: Date.now() });
  return packages;
}
