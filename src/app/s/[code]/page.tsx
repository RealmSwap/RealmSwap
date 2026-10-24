import type { Metadata } from "next";
import { getPublicStatus } from "@/lib/statusShare";
import { formatSessionStart } from "@/lib/sessions";
import { StatusCard } from "./StatusCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { code: string };
}): Promise<Metadata> {
  const status = await getPublicStatus(params.code).catch(() => null);
  if (!status) {
    return { title: "Server status | RealmSwap", robots: { index: false } };
  }
  const bits = [
    status.status === "RUNNING" ? "Up" : "Offline",
    status.players != null ? `${status.players} players` : null,
    status.nextSession ? `next session ${formatSessionStart(status.nextSession.startTime)}` : null,
  ].filter(Boolean);
  return {
    title: `${status.name} — status | RealmSwap`,
    description: bits.join(" · "),
    robots: { index: false },
    openGraph: {
      title: status.name,
      description: bits.join(" · "),
    },
  };
}

export default async function StatusPage({
  params,
}: {
  params: { code: string };
}) {
  const status = await getPublicStatus(params.code).catch(() => null);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <StatusCard initial={status} />
      <a
        href="/register"
        className="mt-8 text-xs text-slate-500 hover:text-accentPurple transition-colors"
      >
        Host your own game server with RealmSwap →
      </a>
    </main>
  );
}
