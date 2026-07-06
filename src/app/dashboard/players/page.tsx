import React from "react";
import PlayersView from "@/components/PlayersView";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Players | RealmSwap" };

export default async function PlayersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return <PlayersView user={user} />;
}
