import { prisma } from "@/lib/db";
import ConsoleView from "@/components/ConsoleView";
import { Suspense } from "react";

export default async function ConsolePage() {
  const user = { name: "Demo User", email: "demo@gamevault.gg" };
  const servers = await prisma.server.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading console...</div>}>
      <ConsoleView user={user} servers={servers} />
    </Suspense>
  );
}
