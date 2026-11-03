#!/usr/bin/env node
// Generates supabase/migrations/<stamp>_official_realm_seed.sql — the "RealmSwap
// Official" starter shelf for the marketplace: the most popular provider packs,
// expressed as v2 realm payloads ({ modpack: { kind, projectId } }) that ride
// the verified deploy pipeline (resolve → download → snapshot → boot test →
// rollback). Idempotent: re-running the generated SQL never duplicates rows
// (guarded by the deterministic realm slug).
//
// Usage:  node scripts/generate-official-realm-seed.mjs [--cf-limit 25] [--mr-limit 20]
//
// Needs CURSEFORGE_API_KEY in .env (bcrypt-format key; this script un-escapes
// the `\$` dotenv form). Modrinth needs no key. Network required; nothing is
// written to the cloud from here — the output SQL is applied with
// `supabase db push` / the SQL editor alongside the other migrations.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 ? Number(args[i + 1]) : dflt;
};
const CF_LIMIT = flag("--cf-limit", 25);
const MR_LIMIT = flag("--mr-limit", 20);
const stamp = process.env.SEED_STAMP || "20261102170000";

function loadCfKey() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("CURSEFORGE_API_KEY="));
  if (!line) return null;
  // dotenv stores the bcrypt `$2a$10$...` key with `\$` escapes; the real key
  // contains literal `$`.
  return line.slice("CURSEFORGE_API_KEY=".length).trim().replace(/\\\$/g, "$");
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

function sqlText(s) {
  return (s ?? "").replace(/'/g, "''").replace(/\\/g, "\\\\");
}

async function fetchCurseforgeTop() {
  const key = loadCfKey();
  if (!key) {
    console.error("No CURSEFORGE_API_KEY in .env — skipping CurseForge packs.");
    return [];
  }
  // Same call shape the app's own CF client uses (sortField 6 = total
  // downloads, sortOrder=desc — the API ignores the sortDescending spelling).
  const res = await fetch(
    `https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&sortField=6&sortOrder=desc&pageSize=${CF_LIMIT}`,
    { headers: { "x-api-key": key, accept: "application/json" } },
  );
  if (!res.ok) {
    console.error(`CurseForge search failed: ${res.status} ${await res.text().catch(() => "")}`);
    return [];
  }
  const data = await res.json();
  return (data.data ?? []).map((m) => ({
    source: "CurseForge",
    projectId: String(m.id),
    name: m.name,
    description: (m.summary ?? "").slice(0, 480),
    downloads: m.downloadCount,
    slug: `official-${slugify(m.name)}-cf${m.id}`,
    tags: ["Minecraft", "CurseForge", "Modpack", "Official"],
  }));
}

async function fetchModrinthTop() {
  // OR within a facet group, AND across groups: modpacks that are usable on
  // the server side (required OR optional).
  const facets = [["project_type:modpack"], ["server_side:required", "server_side:optional"]];
  const res = await fetch(
    `https://api.modrinth.com/v2/search?index=downloads&limit=${MR_LIMIT * 2}&facets=${encodeURIComponent(JSON.stringify(facets))}`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    console.error(`Modrinth search failed: ${res.status} ${await res.text().catch(() => "")}`);
    return [];
  }
  const data = await res.json();
  const seen = new Set();
  const hits = [];
  for (const h of data.hits ?? []) {
    if (hits.length >= MR_LIMIT) break;
    const id = h.project_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    hits.push({
      source: "Modrinth",
      projectId: id,
      name: h.title,
      description: (h.description ?? "").slice(0, 480),
      downloads: h.downloads,
      slug: `official-${slugify(h.title)}-mr-${id.toLowerCase()}`,
      tags: ["Minecraft", "Modrinth", "Modpack", "Official"],
    });
  }
  return hits;
}

function realmInsert(p) {
  const payload = {
    version: "2.0",
    mods: [],
    configOverrides: [],
    startupParams: {},
    loader: null,
    modpack: { kind: "curseforge", projectId: p.projectId },
  };
  if (p.source === "Modrinth") payload.modpack = { kind: "mrpack", projectId: p.projectId };
  const description =
    p.description ||
    `${p.name} — the most popular packs on ${p.source}, curated by RealmSwap as an official one-click realm. Every deploy runs the real install through a sandbox boot test; a bad pack rolls back automatically.`;
  return `insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, '${sqlText(p.slug)}', '${sqlText(p.name)}', '${sqlText(description)}', 'MINECRAFT',
       array['${p.tags.map((t) => sqlText(t)).join("','")}']::text[],
       '${sqlText(JSON.stringify(payload))}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = '${sqlText(p.slug)}');`;
}

const [cf, mr] = await Promise.all([fetchCurseforgeTop(), fetchModrinthTop()]);
// The big packs are published to both providers; listing both reads as a
// duplicate shelf. Prefer the CurseForge copy (first-party distribution),
// drop the Modrinth twin by slugified name.
const cfNames = new Set(cf.map((p) => slugify(p.name)));
const mrDeduped = mr.filter((p) => !cfNames.has(slugify(p.name)));
const packs = [...cf, ...mrDeduped];
if (packs.length === 0) {
  console.error("No packs fetched — refusing to write an empty seed.");
  process.exit(1);
}

const header = `-- Official realm seed (generated ${new Date().toISOString().slice(0, 10)} by scripts/generate-official-realm-seed.mjs)
-- "RealmSwap Official" starter shelf: the most popular packs on CurseForge and
-- Modrinth as one-click v2 realms. seller_id NULL = platform-official; the
-- publish guard exempts NULL-uid (trusted migration) contexts, which is why
-- verified_level OFFICIAL can be set here when no client can.
-- Deploys of these realms run the verified pipeline (snapshot → boot test →
-- rollback) client-side; OFFICIAL means "curated source", the boot test is
-- the per-install verification.
-- Idempotent: the WHERE NOT EXISTS guard on the deterministic slug makes this
-- safe to re-run.

`;

const body = packs.map(realmInsert).join("\n\n");
const outPath = path.resolve(process.cwd(), `supabase/migrations/${stamp}_official_realm_seed.sql`);
fs.writeFileSync(outPath, header + body + "\n");
console.log(`Wrote ${packs.length} official realms (${cf.length} CurseForge, ${mr.length} Modrinth) to ${outPath}`);
