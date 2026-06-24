// One-time data backfill for the custom-server-definitions feature.
// Pre-release: promote all existing users to ADMIN, and backfill each Server's
// definitionId by matching its legacy `game` string to the built-in slug.
// Idempotent: safe to run multiple times.
const { PrismaClient } = require("../src/generated/client");
const prisma = new PrismaClient();

async function main() {
  // 1. Promote all existing users to ADMIN (pre-release).
  const usersUpdated = await prisma.user.updateMany({ data: { role: "ADMIN" } });
  console.log(`Set role=ADMIN on ${usersUpdated.count} user(s).`);

  // 2. Backfill Server.definitionId from the legacy game string -> built-in slug.
  const servers = await prisma.server.findMany({ where: { definitionId: null } });
  let linked = 0;
  for (const s of servers) {
    const def = await prisma.gameDefinition.findFirst({
      where: { ownerId: null, slug: s.game.toUpperCase() },
    });
    if (def) {
      await prisma.server.update({ where: { id: s.id }, data: { definitionId: def.id } });
      linked++;
    } else {
      console.warn(`No built-in definition for server ${s.id} (game=${s.game}); left unlinked.`);
    }
  }
  console.log(`Linked ${linked}/${servers.length} server(s) to a definition.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
