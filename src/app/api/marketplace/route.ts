import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameSlug = searchParams.get("game");
    const tag = searchParams.get("tag");
    const verifiedLevel = searchParams.get("verifiedLevel");
    const q = searchParams.get("q") || "";
    
    // Pagination parameters
    const offset = parseInt(searchParams.get("offset") || "0");
    const limitParam = parseInt(searchParams.get("limit") || "20");
    const limit = Math.min(limitParam, 50);

    let whereClause: any = {};
    
    if (gameSlug) {
      whereClause.gameSlug = gameSlug;
    }
    
    if (tag) {
      whereClause.tags = {
        contains: tag,
      };
    }
    
    if (verifiedLevel) {
      whereClause.verifiedLevel = verifiedLevel;
    }
    
    if (q.trim() !== "") {
      whereClause.OR = [
        { name: { contains: q } },
        { gameSlug: { contains: q } },
        { description: { contains: q } }
      ];
    }

    const sort = searchParams.get("sort") || "newest"; // "likes", "downloads", "newest"
    let orderBy: any = { createdAt: "desc" };
    if (sort === "likes") {
      orderBy = { likes: "desc" };
    } else if (sort === "downloads") {
      orderBy = { downloads: "desc" };
    }

    const templates = await prisma.marketplaceTemplate.findMany({
      where: whereClause,
      orderBy,
      skip: offset,
      take: limit + 1, // Fetch one extra to determine if there are more
      include: {
        votes: {
          where: { userId: user.id },
          select: { type: true }
        }
      }
    });

    const hasMore = templates.length > limit;
    if (hasMore) {
      templates.pop(); // Remove the extra item
    }

    const enrichedTemplates = templates.map(t => ({
      ...t,
      userVote: t.votes[0]?.type || null
    }));

    return NextResponse.json({ results: enrichedTemplates, hasMore });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
