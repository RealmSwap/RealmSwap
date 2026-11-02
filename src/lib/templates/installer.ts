import { prisma } from "@/lib/db";
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
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

async function resolveDefinitionId(
  template: DeployableTemplate,
  userId: string,
): Promise<string> {
  // 1. Handle Custom Game Definition
  if (template.customDefSpec) {
    const existingDef = await prisma.gameDefinition.findFirst({
      where: { slug: template.gameSlug },
    });

    if (existingDef) {
      return existingDef.id;
    }
    const customDefSpec = template.customDefSpec as any;

    if (customDefSpec.install?.url) {
      const allowedDomains = ["github.com", "githubusercontent.com", "thunderstore.io", "curseforge.com", "steamcdn-a.akamaihd.net"];
      try {
        const parsedUrl = new URL(customDefSpec.install.url);
        const isAllowed = allowedDomains.some(d => parsedUrl.hostname === d || parsedUrl.hostname.endsWith("." + d));
        if (!isAllowed) {
          throw new Error(`Download URL origin not trusted: ${parsedUrl.hostname}`);
        }
      } catch (e: any) {
        throw new Error(`Invalid or untrusted download URL in definition: ${e.message}`);
      }
    }

    const newDef = await prisma.gameDefinition.create({
      data: {
        slug: template.gameSlug,
        displayName: customDefSpec.name || template.gameSlug,
        icon: "🎮", // default fallback
        installMethod: customDefSpec.install ? (customDefSpec.install.appId ? "STEAMCMD" : "DOWNLOAD") : "CUSTOM_SCRIPT",
        spec: JSON.stringify(customDefSpec),
        ownerId: userId,
      },
    });
    return newDef.id;
  }

  const existingDef = await prisma.gameDefinition.findFirst({
    where: { slug: template.gameSlug },
  });
  if (!existingDef) throw new Error("Required game definition not found and no custom spec provided.");
  return existingDef.id;
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
 */
export async function createRealmServerShell(
  template: DeployableTemplate,
  userId: string,
): Promise<CreatedServerShell> {
  const payload = template.payload;
  const defId = await resolveDefinitionId(template, userId);

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
