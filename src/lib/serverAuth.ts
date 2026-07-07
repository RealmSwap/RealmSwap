import { prisma } from "@/lib/db";

export type Role = "ADMIN" | "MODERATOR" | "VIEWER";

const ROLE_RANKS: Record<Role, number> = {
  ADMIN: 3,
  MODERATOR: 2,
  VIEWER: 1,
};

export async function verifyServerAccess(serverId: string, userId: string, requiredRole: Role = "VIEWER") {
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  });

  if (!server) return null;

  // Owner always has ADMIN implicitly
  if (server.userId === userId) {
    return { server, isOwner: true, isCollaborator: false, role: "ADMIN" as Role };
  }

  const collaborator = await prisma.collaborator.findFirst({
    where: { serverId, userId }
  });

  if (collaborator) {
    const userRole = (collaborator.role as Role) || "VIEWER";
    
    if (ROLE_RANKS[userRole] >= ROLE_RANKS[requiredRole]) {
      return { server, isOwner: false, isCollaborator: true, role: userRole };
    } else {
       // Role insufficient
       return null;
    }
  }

  return null;
}
