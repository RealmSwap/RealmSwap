/**
 * Merge one local user account into another (e.g. repairing the duplicate
 * accounts the old case-sensitive re-key path could fork).
 *
 * Usage:
 *   npx tsx scripts/merge-users.ts --from duplicate@example.com --into keeper@example.com
 *
 * Unlike the hand-run scripts this replaces, the relation list is derived
 * from the Prisma schema at runtime (DMMF), so it can't silently miss a
 * newer relation (the hand-written versions missed S3Setting and
 * Subscription). Ownership-ish relations are re-pointed to the keeper; the
 * remaining FKs are cleaned up by the schema's explicit onDelete rules when
 * the duplicate row is deleted.
 */
import { Prisma } from "../src/generated/client";
import { prisma } from "../src/lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fromEmail = arg("--from")?.toLowerCase();
const intoEmail = arg("--into")?.toLowerCase();

if (!fromEmail || !intoEmail || fromEmail === intoEmail) {
  console.error("Usage: npx tsx scripts/merge-users.ts --from <duplicate email> --into <keeper email>");
  process.exit(1);
}

// Every relation targeting User, with the FK field name on the owning model
// and whether it's a list (1:N) or single (1:1) relation.
function userRelations(): { model: string; field: string; isList: boolean }[] {
  const relations: { model: string; field: string; isList: boolean }[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind === "object" && field.type === "User" && field.relationFromFields?.length === 1) {
        relations.push({ model: model.name, field: field.relationFromFields[0], isList: field.isList });
      }
    }
  }
  return relations;
}

async function main() {
  const keeper = await prisma.user.findUnique({ where: { email: intoEmail } });
  const duplicate = await prisma.user.findUnique({ where: { email: fromEmail } });
  if (!keeper || !duplicate) {
    console.error("Both accounts must exist locally:", { keeper: !!keeper, duplicate: !!duplicate });
    process.exit(1);
  }
  console.log(`Merging ${duplicate.email} (${duplicate.id}) into ${keeper.email} (${keeper.id})`);

  const relations = userRelations();
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Free the keeper's email in case the duplicate holds a variant case of it
    if (duplicate.id !== keeper.id) {
      await tx.user.update({ where: { id: duplicate.id }, data: { email: `merged_${Date.now()}_${duplicate.email}` } });
    }

    for (const rel of relations) {
      const delegate = (tx as any)[rel.model.charAt(0).toLowerCase() + rel.model.slice(1)];
      if (!delegate) { skipped.push(rel.model); continue; }
      try {
        if (rel.isList) {
          const res = await delegate.updateMany({
            where: { [rel.field]: duplicate.id },
            data: { [rel.field]: keeper.id },
          });
          if (res.count) console.log(`  ${rel.model}.${rel.field}: re-pointed ${res.count}`);
        } else {
          // 1:1 — the keeper may already have a row; delete the duplicate's
          // row only if the keeper's slot is free, otherwise drop it.
          const dupRow = await delegate.findFirst({ where: { [rel.field]: duplicate.id } });
          if (!dupRow) continue;
          const keeperRow = await delegate.findUnique({ where: { [rel.field]: keeper.id } });
          if (keeperRow) {
            await delegate.delete({ where: { [rel.field]: duplicate.id } });
            console.log(`  ${rel.model}.${rel.field}: keeper already had one — deleted duplicate's`);
          } else {
            await delegate.update({ where: { [rel.field]: duplicate.id }, data: { [rel.field]: keeper.id } });
            console.log(`  ${rel.model}.${rel.field}: moved to keeper`);
          }
        }
      } catch (err: any) {
        console.error(`  ${rel.model}.${rel.field}: FAILED — ${err.message}`);
        throw err;
      }
    }

    await tx.user.delete({ where: { id: duplicate.id } });
  });

  if (skipped.length) console.warn("Skipped (no delegate):", skipped.join(", "));
  console.log("Merge complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
