import { prisma } from "@/lib/db";
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
import { vetUntrustedSpec, type UntrustedDefinitionSummary, type UntrustedSpecResult } from "@/lib/definitions/untrusted";
import { dataRoot } from "@/lib/appPaths";
import { TemplatePayload, TemplateConfigOverride, DeployableTemplate, isV2Payload } from "./types";
import path from "path";
import fs from "fs";

/**
 * A realm/template ready to deploy locally. Fields come from the cloud `realms`
 * row (payload / custom_def_spec are already parsed objects). The cloud side
 * (acquire_realm RPC) records ownership + transaction + the download bump, so
 * the installer no longer touches any marketplace counters.
 */
// DeployableTemplate lives in ./types (shared with the materialize route).

export interface CreatedServerShell {
  serverId: string;
  gameSlug: string;
  defName: string;
  v2: boolean;
}

/** The realm's own game definition failed the untrusted-definition gate. */
export class RealmDefinitionRejectedError extends Error {
  constructor(public readonly errors: string[]) {
    super(`This realm's custom game definition was refused: ${errors.slice(0, 3).join(" ")}`);
    this.name = "RealmDefinitionRejectedError";
  }
}

/** Deploying would install a new game definition and the caller has not agreed to it. */
export class RealmDefinitionConsentError extends Error {
  constructor(public readonly summary: UntrustedDefinitionSummary) {
    super("This realm installs its own game definition; deploying it needs explicit consent.");
    this.name = "RealmDefinitionConsentError";
  }
}

export type RealmDefinitionPlan =
  | { kind: "existing"; definitionId: string }
  | { kind: "new"; slug: string; vetted: Extract<UntrustedSpecResult, { ok: true }> };

/**
 * Decide which game definition a realm deploy binds to, without writing
 * anything. A definition the deployer can already use wins — a built-in
 * (matched case-insensitively, so a realm can't shadow "MINECRAFT" with its
 * own "minecraft" and inherit the runners' game-specific handling) or one
 * they own. Only otherwise does the realm's custom_def_spec come into play,
 * and then it must pass the untrusted-definition gate: the realm row is cloud
 * data that any signed-in account can write without going through this app.
 */
export async function planRealmDefinition(
  template: Pick<DeployableTemplate, "gameSlug" | "customDefSpec">,
  userId: string,
): Promise<RealmDefinitionPlan> {
  const slug = String(template.gameSlug ?? "");
  const candidates = await prisma.gameDefinition.findMany({
    where: {
      OR: [
        { ownerId: null, slug: { in: [slug, slug.toUpperCase()] } },
        { ownerId: userId, slug },
      ],
    },
  });
  const existing = candidates.find((d) => d.ownerId === null) ?? candidates[0];
  if (existing) return { kind: "existing", definitionId: existing.id };

  if (!template.customDefSpec) {
    throw new Error("Required game definition not found and no custom spec provided.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(slug)) {
    throw new RealmDefinitionRejectedError(["The realm's game id is not a valid identifier."]);
  }
  const vetted = vetUntrustedSpec(template.customDefSpec);
  if (!vetted.ok) throw new RealmDefinitionRejectedError(vetted.errors);
  return { kind: "new", slug, vetted };
}

async function resolveDefinitionId(
  template: DeployableTemplate,
  userId: string,
  allowNewDefinition: boolean,
): Promise<string> {
  const plan = await planRealmDefinition(template, userId);
  if (plan.kind === "existing") return plan.definitionId;
  if (!allowNewDefinition) throw new RealmDefinitionConsentError(plan.vetted.summary);

  const { spec, installMethod, meta } = plan.vetted;
  const install = spec.install as { requiredDiskGB?: number };
  const newDef = await prisma.gameDefinition.create({
    data: {
      slug: plan.slug,
      displayName: meta.name || plan.slug,
      icon: meta.icon || "🎮",
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.recommendedRamGB ? { recommendedRamGB: meta.recommendedRamGB } : {}),
      ...(install.requiredDiskGB ? { requiredDiskGB: install.requiredDiskGB } : {}),
      installMethod,
      // The gate's normalized copy, never the cloud row's raw JSON.
      spec: JSON.stringify(spec),
      ownerId: userId,
    },
  });
  return newDef.id;
}

/**
 * Shared config-override writer. Path-traversal guard + extension allowlist,
 * verbatim write. v1 deploys apply in the shell phase; v2 deploys apply after
 * the pack/mod materialization so realm overrides win over pack defaults.
 */
export function applyConfigOverrides(
  serverId: string,
  overrides: TemplateConfigOverride[] | undefined,
): number {
  if (!overrides || overrides.length === 0) return 0;
  const root = dataRoot();
  let applied = 0;
  for (const override of overrides) {
    if (override.path.includes("..") || path.isAbsolute(override.path)) {
      console.warn(`Template deploy blocked malicious path: ${override.path}`);
      continue; // path traversal security check
    }

    const ext = path.extname(override.path).toLowerCase();
    const allowedExts = [".json", ".ini", ".cfg", ".txt", ".xml", ".yml", ".yaml", ".properties"];
    if (!allowedExts.includes(ext) && ext !== "") {
      console.warn(`Template deploy blocked malicious file extension: ${override.path}`);
      continue;
    }

    const configPath = path.join(root, "local-servers", serverId, override.path);
    const dir = path.dirname(configPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // For now, simple write replacement
    fs.writeFileSync(configPath, override.content, "utf-8");
    applied += 1;
  }
  return applied;
}

/**
 * Phase 1 of a realm deploy: resolve the definition, create the server shell,
 * apply params + config overrides. Cheap and synchronous.
 *
 * v1 payloads keep the entire historic behavior in this one call: placeholder
 * ModInstallation rows (version "latest", nothing downloaded). v2 payloads
 * record no mod rows — the materialize phase downloads real files through the
 * verified pipeline and the installers record real rows.
 *
 * A realm that brings its own game definition only deploys with
 * `allowNewDefinition` — the caller's statement that the user saw what that
 * definition runs and agreed. Without it this throws
 * RealmDefinitionConsentError before anything is written.
 */
export async function createRealmServerShell(
  template: DeployableTemplate,
  userId: string,
  opts: { allowNewDefinition?: boolean } = {},
): Promise<CreatedServerShell> {
  const payload = template.payload;
  const defId = await resolveDefinitionId(template, userId, opts.allowNewDefinition === true);

  // 2. Create the Server
  const def = await prisma.gameDefinition.findUniqueOrThrow({ where: { id: defId } });
  const spec = parseSpec(def.spec);
  const v2 = isV2Payload(payload);

  const server = await prisma.server.create({
    data: {
      userId,
      name: `${template.name} - Deployed`,
      game: def.slug,
      definitionId: def.id,
      paramValues: stringifyParamValues(payload.startupParams || {}),
      ramAllocation: def.recommendedRamGB || 4,
      region: "LOCALHOST",
      status: "STOPPED",
      runnerType: "LOCAL",
      ipAddress: "127.0.0.1",
      port: spec.defaultPort,
      enableUpnp: false,
    },
  });

  try {
    // 3. Mod Installations — legacy placeholder rows only.
    if (!v2 && payload.mods && payload.mods.length > 0) {
      const modPromises = payload.mods.map(mod =>
        prisma.modInstallation.create({
          data: {
            serverId: server.id,
            provider: mod.provider,
            packageId: mod.packageId,
            version: "latest",
            name: mod.name || mod.packageId,
          },
        })
      );
      await Promise.all(modPromises);
    }

    // 4. Config Overrides — v1 applies here; v2 defers so pack-provided
    // defaults land first and the realm author's files win.
    if (!v2) {
      applyConfigOverrides(server.id, payload.configOverrides);
    }
  } catch (err) {
    // Never leave a half-created shell behind.
    await prisma.server.delete({ where: { id: server.id } }).catch(() => {});
    throw err;
  }

  // 5. Activity Log
  await prisma.activityLog.create({
    data: {
      userId,
      action: "CREATE_SERVER",
      details: v2
        ? `Deployed realm '${template.name}' for ${def.slug} (verified install pending).`
        : `Deployed template '${template.name}' for ${def.slug}.`,
    },
  });

  return { serverId: server.id, gameSlug: def.slug, defName: def.displayName, v2 };
}
