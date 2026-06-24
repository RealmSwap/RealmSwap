/**
 * Convert a display name to a URL-safe slug.
 * e.g. "ARK: Survival Evolved!" → "ark-survival-evolved"
 */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with hyphens
    .replace(/^-+|-+$/g, "")      // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-");       // collapse consecutive hyphens
  return s || "custom-game";
}

/**
 * Generate a slug that is unique among the given existing slugs for the same owner.
 * If the base slug already exists, appends -2, -3, etc. until unique.
 */
export function uniqueSlug(name: string, existingSlugs: string[]): string {
  const base = slugify(name);
  if (!existingSlugs.includes(base)) return base;

  let counter = 2;
  while (existingSlugs.includes(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}
