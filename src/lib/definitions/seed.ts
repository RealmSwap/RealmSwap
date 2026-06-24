import type { BuiltinDefinition } from "./builtins";
import { BUILTIN_DEFINITIONS } from "./builtins";
import { stringifySpec } from "./serialize";

export function buildBuiltinData(def: BuiltinDefinition) {
  const install = def.spec.install as any;
  return {
    slug: def.slug,
    displayName: def.displayName,
    icon: def.icon,
    color: def.color,
    description: def.description,
    recommendedRamGB: def.recommendedRamGB,
    requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : 3,
    ownerId: null as string | null,
    isBuiltIn: true,
    installMethod: def.installMethod,
    spec: stringifySpec(def.spec),
  };
}

export async function upsertBuiltinDefinitions(prisma: {
  gameDefinition: {
    findFirst: (a: any) => Promise<any>;
    create: (a: any) => Promise<any>;
    update: (a: any) => Promise<any>;
  };
}): Promise<void> {
  for (const def of BUILTIN_DEFINITIONS) {
    const data = buildBuiltinData(def);
    const existing = await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: def.slug } });
    if (existing) {
      await prisma.gameDefinition.update({ where: { id: existing.id }, data });
    } else {
      await prisma.gameDefinition.create({ data });
    }
  }
}
