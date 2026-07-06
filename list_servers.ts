import { prisma } from './src/lib/db';

async function main() {
  const servers = await prisma.server.findMany();
  console.log(JSON.stringify(servers, null, 2));
}

main().then(() => prisma.$disconnect());
