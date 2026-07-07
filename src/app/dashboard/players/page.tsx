import React from "react";
import PlayersView from "@/components/PlayersView";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const metadata = { title: "Players | RealmSwap" };

export default async function PlayersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const servers = await prisma.server.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return <PlayersView user={user} servers={servers} />;
}
