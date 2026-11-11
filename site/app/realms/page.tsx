import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";

import RealmCard from "@/components/RealmCard";
import { getPublicRealms } from "@/lib/backend/realms";

// Always render live marketplace data — the index changes as creators publish.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Realms",
  description:
    "Browse ready-made community realms — modpacks, worlds, and full server setups you can deploy on your own PC in one click, free.",
  alternates: { canonical: "/realms" },
};

type RealmsIndexProps = {
  searchParams?: { game?: string | string[] };
};

function readGameParam(searchParams: RealmsIndexProps["searchParams"]): string | null {
  const raw = searchParams?.game;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function RealmsIndexPage({ searchParams }: RealmsIndexProps) {
  const { realms, total } = await getPublicRealms(60);

  // Game filter is derived from the listed realms (the index is capped at 60),
  // so the pill list always reflects what's actually on the page.
  const games = Array.from(
    new Set(realms.map((r) => r.gameSlug).filter((g): g is string => Boolean(g)))
  ).sort();

  const activeGame = readGameParam(searchParams);
  const visible = activeGame
    ? realms.filter((r) => (r.gameSlug ?? "").toUpperCase() === activeGame)
    : realms;

  const buildHref = (game: string | null) =>
    game ? `/realms?game=${encodeURIComponent(game)}` : "/realms";

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Header */}
      <header className="glass-panel border-b border-borderDark px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-mutedText hover:text-white transition-colors"
          >
            &larr; RealmSwap
          </Link>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-accentPurple">
            <Store className="w-3.5 h-3.5" /> Community Marketplace
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-16 pb-20">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-5xl font-extrabold mb-4">Browse Realms</h1>
          <p className="text-mutedText max-w-2xl mx-auto mb-3">
            Ready-made server worlds shared by the community. Pick one, deploy it to your
            own PC in one click, and invite your friends.
          </p>
          <p className="text-sm text-mutedText">
            <span className="font-bold text-slate-200">{total}</span> official realms and
            counting
          </p>
        </div>

        {/* Game filter */}
        {games.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            <Link
              href={buildHref(null)}
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all duration-200 ${
                !activeGame
                  ? "bg-accentPurple/15 text-accentPurple border-accentPurple/30"
                  : "bg-white/5 text-mutedText border-white/5 hover:text-white hover:border-white/15"
              }`}
            >
              All
            </Link>
            {games.map((game) => (
              <Link
                key={game}
                href={buildHref(game)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all duration-200 ${
                  activeGame === game.toUpperCase()
                    ? "bg-accentPurple/15 text-accentPurple border-accentPurple/30"
                    : "bg-white/5 text-mutedText border-white/5 hover:text-white hover:border-white/15"
                }`}
              >
                {game}
              </Link>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="glass-panel max-w-xl mx-auto text-center rounded-2xl border border-white/5 p-10">
            <Store className="w-8 h-8 text-accentPurple mx-auto mb-4" />
            {activeGame ? (
              <>
                <h2 className="font-bold text-lg mb-2">No {activeGame} realms yet</h2>
                <p className="text-mutedText text-sm">
                  Nothing published for this game so far.{" "}
                  <Link href="/realms" className="text-accentPurple hover:text-accentPurpleHover">
                    View all realms
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-lg mb-2">Marketplace launching soon</h2>
                <p className="text-mutedText text-sm">
                  Published realms will show up here automatically.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {activeGame && (
              <p className="text-sm text-mutedText mb-6 text-center">
                Showing {visible.length} {activeGame} realm{visible.length === 1 ? "" : "s"}
              </p>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visible.map((realm) => (
                <RealmCard
                  key={realm.id}
                  slug={realm.slug}
                  name={realm.name}
                  description={realm.description}
                  gameSlug={realm.gameSlug}
                  tags={realm.tags}
                  priceCents={realm.priceCents}
                  currency={realm.currency}
                  likeCount={realm.likeCount}
                  downloadCount={realm.downloadCount}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-borderDark bg-[#08090c] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-mutedText">
          <Link href="/" className="hover:text-white transition-colors">
            RealmSwap — host locally, play globally
          </Link>
          <span>{total} official realms and counting</span>
        </div>
      </footer>
    </div>
  );
}
