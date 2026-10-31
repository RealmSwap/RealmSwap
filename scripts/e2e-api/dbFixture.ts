/**
 * Direct throwaway-DB access for harness fixtures that no API route exposes:
 * flipping a server's status (RCON success paths), seeding Discord link codes
 * (the bot that normally mints them needs Discord credentials), and seeding
 * vault archives for the delete route.
 *
 * This is the RAW prisma client — deliberately NOT the app's extended client
 * (src/lib/db.ts), because the fixtures only touch plain columns. Never write
 * secretBox-encrypted fields (Server secrets, AgentNode.secret, S3Setting
 * secrets) through it: the app would read them unencrypted.
 */

import { PrismaClient } from "../../src/generated/client";
import { DATABASE_URL } from "./config";

export const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});
