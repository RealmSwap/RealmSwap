import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { z } from "zod";

// GET /api/servers/[id]/collaborators
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    // Verify server ownership
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!server || server.userId !== user.id) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const collaborators = await prisma.collaborator.findMany({
      where: { serverId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json(collaborators);
  } catch (error: any) {
    console.error("GET /api/servers/[id]/collaborators error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/servers/[id]/collaborators
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const collabSchema = z.object({
      email: z.string().email(),
      role: z.enum(["ADMIN", "MODERATOR", "VIEWER"])
    });

    const body = await req.json();
    const parsed = collabSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const { email, role } = parsed.data;

    // Verify server ownership
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!server || server.userId !== user.id) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Find the invitee by email
    const invitee = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!invitee) {
      return NextResponse.json(
        { error: "No user registered with this email on this GameVault instance." },
        { status: 404 }
      );
    }

    if (invitee.id === user.id) {
      return NextResponse.json(
        { error: "You cannot invite yourself as a collaborator." },
        { status: 400 }
      );
    }

    // Check if already a collaborator
    const existing = await prisma.collaborator.findUnique({
      where: {
        serverId_userId: {
          serverId,
          userId: invitee.id
        }
      }
    });

    if (existing) {
      return NextResponse.json(
        { error: "This user is already a collaborator on this server." },
        { status: 400 }
      );
    }

    // Create collaborator
    const collaborator = await prisma.collaborator.create({
      data: {
        serverId,
        userId: invitee.id,
        role: role
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Invited user '${invitee.name}' (${invitee.email}) to co-manage server '${server.name}' as ${role}.`
      }
    });

    return NextResponse.json(collaborator, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/collaborators error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/servers/[id]/collaborators
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify server ownership
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!server || server.userId !== user.id) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Delete collaborator
    await prisma.collaborator.delete({
      where: {
        serverId_userId: {
          serverId,
          userId
        }
      }
    });

    // Write Activity Log
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Revoked collaborator access for '${targetUser?.name || userId}' on server '${server.name}'.`
      }
    });

    return NextResponse.json({ success: true, message: "Collaborator access revoked" });
  } catch (error: any) {
    console.error("DELETE /api/servers/[id]/collaborators error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PUT /api/servers/[id]/collaborators
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const putSchema = z.object({
      userId: z.string(),
      role: z.enum(["ADMIN", "MODERATOR", "VIEWER"])
    });

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const { userId, role } = parsed.data;

    // Verify server ownership
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!server || server.userId !== user.id) {
      return NextResponse.json({ error: "Server not found or unauthorized" }, { status: 404 });
    }

    // Update collaborator
    const updated = await prisma.collaborator.update({
      where: {
        serverId_userId: {
          serverId,
          userId
        }
      },
      data: {
        role
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PUT /api/servers/[id]/collaborators error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
