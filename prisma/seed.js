const { PrismaClient } = require("../src/generated/client");
const bcrypt = require("bcryptjs");

// Built-in game definitions are the source of truth in src/lib/definitions/builtins.ts.
// We keep a JSON mirror so the plain-node seed script can read them without TS tooling.
const builtins = require("../src/lib/definitions/builtins.generated.json");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding GameVault database...");

  // Seed built-in game definitions (idempotent: findFirst → update/create)
  for (const def of builtins) {
    const install = def.spec.install || {};
    const data = {
      slug: def.slug, displayName: def.displayName, icon: def.icon, color: def.color,
      description: def.description, recommendedRamGB: def.recommendedRamGB,
      requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : 3,
      ownerId: null, isBuiltIn: true, installMethod: def.installMethod,
      spec: JSON.stringify(def.spec),
    };
    const existing = await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: def.slug } });
    if (existing) {
      await prisma.gameDefinition.update({ where: { id: existing.id }, data });
    } else {
      await prisma.gameDefinition.create({ data });
    }
  }
  console.log("Seeded built-in game definitions.");

  // Clean existing database
  await prisma.activityLog.deleteMany({});
  await prisma.archive.deleteMany({});
  await prisma.server.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.user.deleteMany({});

  // Hash demo password
  const passwordHash = bcrypt.hashSync("password123", 10);

  // Create demo user
  const demoUser = await prisma.user.create({
    data: {
      email: "demo@gamevault.gg",
      name: "Cody Gamer",
      passwordHash: passwordHash,
    },
  });
  console.log(`Created demo user: ${demoUser.email}`);

  // Create subscription for demo user (Party Plan - 2 slots)
  const subscription = await prisma.subscription.create({
    data: {
      userId: demoUser.id,
      plan: "PARTY",
      status: "ACTIVE",
      activeSlots: 2,
    },
  });
  console.log(`Created subscription: ${subscription.plan} (${subscription.activeSlots} slots)`);

  // Create active servers
  const mcServer = await prisma.server.create({
    data: {
      userId: demoUser.id,
      name: "Survival World",
      game: "MINECRAFT",
      ramAllocation: 4.0,
      region: "US_EAST",
      status: "RUNNING",
      ipAddress: "162.254.204.18",
      port: 25565,
      cpuUsage: 12.4,
      memoryUsage: 3.1,
    },
  });

  const valheimServer = await prisma.server.create({
    data: {
      userId: demoUser.id,
      name: "Viking Realm",
      game: "VALHEIM",
      ramAllocation: 6.0,
      region: "EU_CENTRAL",
      status: "STOPPED",
      ipAddress: "162.254.204.19",
      port: 2456,
      cpuUsage: 0,
      memoryUsage: 0,
    },
  });
  console.log("Created active servers (Minecraft, Valheim)");

  // Create archives (vaulted servers)
  const archivedZomboid = await prisma.archive.create({
    data: {
      userId: demoUser.id,
      serverName: "Rosewood Outpost",
      game: "ZOMBOID",
      saveSizeGB: 1.85,
      archivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // 2 weeks ago
    },
  });

  const archivedArk = await prisma.archive.create({
    data: {
      userId: demoUser.id,
      serverName: "The Island Survival",
      game: "ARK",
      saveSizeGB: 14.2,
      archivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45), // 45 days ago
    },
  });
  console.log("Created archived servers in Vault (Project Zomboid, ARK)");

  // Create activity logs
  const logs = [
    { action: "USER_REGISTER", details: "User registered and subscribed to PARTY plan." },
    { action: "CREATE_SERVER", details: "Created Minecraft server 'Survival World' with 4GB RAM." },
    { action: "START_SERVER", details: "Started Minecraft server 'Survival World'." },
    { action: "CREATE_SERVER", details: "Created Project Zomboid server 'Rosewood Outpost' with 8GB RAM." },
    { action: "ARCHIVE_SERVER", details: "Archived Project Zomboid server 'Rosewood Outpost' (saved 1.85 GB)." },
    { action: "CREATE_SERVER", details: "Created Valheim server 'Viking Realm' with 6GB RAM." },
  ];

  for (const log of logs) {
    await prisma.activityLog.create({
      data: {
        userId: demoUser.id,
        action: log.action,
        details: log.details,
      },
    });
  }
  console.log("Created activity logs");
  console.log("Database successfully seeded!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
