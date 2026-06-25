import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ConsoleView from "@/components/ConsoleView";
import { Suspense } from "react";

export default async function ConsolePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const servers = await prisma.server.findMany({
    where: {
      OR: [
        { userId: user.id },
        { collaborators: { some: { userId: user.id } } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <Suspense fallback={null}>
      <ConsoleView servers={servers} user={user} />
    </Suspense>
  );
}
