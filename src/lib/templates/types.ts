// Realm/template payload. Stored as JSON in the cloud `realms.payload` column
// (and the legacy local MarketplaceTemplate.payload), so old rows must keep
// deploying: isV2Payload() decides which deploy path a payload takes.
//
// v1 payloads (deployed before the verified pipeline): mods were recorded as
// placeholder DB rows with version "latest" and nothing was downloaded — only
// thunderstore/workshop/manual providers ever existed in practice.
//
// v2 payloads ride the same verified pipeline as manual installs:
// loader pin → provider pack → pinned mod replay → config overrides →
// sandbox boot test, with automatic rollback on failure.
export interface TemplateMod {
  // Real provider values as stored on ModInstallation rows. v1 payloads may
  // still carry "manual" (or anything) — the legacy path passes them through.
  provider: string;
  packageId: string;
  name?: string;
  // Pinned install version. Omitted means "latest the provider serves".
  version?: string;
  // Zomboid workshop rows need the ini Mod ID alongside the Workshop ID.
  workshopModId?: string | null;
  dependencies?: string[];
}

export interface TemplateLoaderRef {
  type: "fabric" | "quilt" | "forge" | "neoforge" | "tmodloader";
  // Pinned loader build. Fresh installs use it verbatim; existing installs
  // with a different build warn instead of silently upgrading.
  loaderVersion: string;
  // Required for fresh Minecraft installs (the loader installer downloads
  // vanilla + loader together and needs the target version).
  minecraftVersion?: string;
}

export interface TemplateModpackRef {
  // "curseforge" = CurseForge manifest pack, "mrpack" = Modrinth pack.
  kind: "curseforge" | "mrpack";
  projectId: string;
  // Omit to always deploy the newest downloadable pack file.
  fileId?: number | null;
  versionId?: string;
  packName?: string;
  packVersion?: string;
  mcVersion?: string | null;
  loaderType?: string | null;
  loaderVersion?: string | null;
}

export interface TemplateConfigOverride {
  path: string;
  // Declared merge intent. v1 deploys wrote files verbatim and ignored this;
  // kept for authoring honesty, not yet merged.
  strategy: "template" | "iniMerge" | "jsonMerge";
  content: string;
}

export interface TemplatePayload {
  version: string;
  mods: TemplateMod[];
  configOverrides: TemplateConfigOverride[];
  startupParams: Record<string, string>;
  loader?: TemplateLoaderRef | null;
  modpack?: TemplateModpackRef | null;
}

export interface DeployableTemplate {
  id?: string;
  name: string;
  gameSlug: string;
  payload: TemplatePayload;
  customDefSpec?: unknown | null;
}

/**
 * True when the payload asks for the verified deploy pipeline (loader pins,
 * provider packs, pinned mod replay). Anything else — including every v1
 * payload written before this format existed — deploys exactly as it always
 * has.
 */
export function isV2Payload(payload: TemplatePayload | null | undefined): boolean {
  if (!payload) return false;
  if (payload.loader || payload.modpack) return true;
  // Pinned mod versions only exist in the v2 format. "latest" was the v1
  // placeholder value, not a pin.
  return Array.isArray(payload.mods) && payload.mods.some((m) => Boolean(m.version) && m.version !== "latest");
}
