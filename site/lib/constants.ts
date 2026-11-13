// Site-wide marketing links shared by every page (homepage, /realms, /r/[slug]).
//
// The desktop installer is published as a version-less asset on GitHub Releases
// so the "latest" URL is always valid.

export const DOWNLOAD_URL =
  "https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe";
export const RELEASES_URL = "https://github.com/RealmSwap/RealmSwap/releases";

/** Canonical public origin of this site (absolute links, metadata, sitemap). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://realmswap.app";

/**
 * A download link that remembers which surface sent the visitor — the only
 * thing recorded is that string and (optionally) which realm page they came
 * from. No cookies, no IPs, no ids; see /download and the
 * `download_clicks` migration. Refs are simple tokens: "hero", "realm-cta",
 * "status", …
 */
/** Ref tokens are simple identifiers; anything else is stripped. */
export function sanitizeRef(value: string): string {
  return value.trim().slice(0, 80).replace(/[^a-zA-Z0-9:._-]/g, "") || "unknown";
}

export function downloadUrl(ref: string, realmSlug?: string): string {
  const params = new URLSearchParams({ ref: sanitizeRef(ref) });
  if (realmSlug) params.set("realm", sanitizeRef(realmSlug));
  return `/download?${params.toString()}`;
}
