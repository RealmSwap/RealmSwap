import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Heart,
  PackageCheck,
  Rocket,
  ShieldCheck,
  Store,
  User,
} from "lucide-react";

import { getRealmBySlug } from "@/lib/backend/realms";
import { DOWNLOAD_URL } from "@/lib/constants";

// Always render live data — realm pages are cheap, public, and change often.
export const dynamic = "force-dynamic";

type RealmPageProps = {
  params: { slug: string };
};

export async function generateMetadata({
  params,
}: RealmPageProps): Promise<Metadata> {
  const realm = await getRealmBySlug(params.slug);
  if (!realm) {
    return { title: "Realm not found | RealmSwap" };
  }
  const title = `${realm.name} — one-click Realm`;
  const description =
    realm.description ??
    `Deploy the ${realm.name} Realm to your own PC in one click with RealmSwap — free local game server hosting.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

/**
 * Best-effort read of `payload.modpack` (jsonb, shape still settling upstream).
 * Produces a "CurseForge modpack · project 123456"-style label, or null when
 * the realm has no pinned pack.
 */
function describeModpack(
  payload: Record<string, unknown> | null
): string | null {
  const pack = payload?.modpack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return null;
  const p = pack as Record<string, unknown>;
  const source = [p.source, p.provider, p.platform].find(
    (v): v is string => typeof v === "string"
  );
  const label = /curseforge/i.test(source ?? "")
    ? "CurseForge modpack"
    : /modrinth/i.test(source ?? "")
      ? "Modrinth modpack"
      : "Modpack";
  const projectId = [p.projectId, p.project_id, p.slug].find(
    (v): v is string | number =>
      typeof v === "string" || typeof v === "number"
  );
  return projectId !== undefined ? `${label} · project ${projectId}` : label;
}

export default async function RealmLandingPage({ params }: RealmPageProps) {
  const realm = await getRealmBySlug(params.slug);
  if (!realm) notFound();

  const isOfficial = realm.verifiedLevel === "OFFICIAL";
  const creatorName = realm.sellerId
    ? (realm.sellerName ?? "Community creator")
    : "RealmSwap Official";
  const packLine = describeModpack(realm.payload);
  const modCount = Array.isArray(realm.payload?.mods)
    ? (realm.payload?.mods as unknown[]).length
    : 0;
  const publishedYear = realm.createdAt
    ? new Date(realm.createdAt).getFullYear()
    : null;

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Header */}
      <header className="glass-panel border-b border-borderDark px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-mutedText hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> RealmSwap
          </Link>
          <a
            href={DOWNLOAD_URL}
            className="bg-accentPurple hover:bg-accentPurpleHover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-accentPurple/20 border border-accentPurple/30"
          >
            Download
          </a>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 pt-12 pb-20">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <Link
            href="/realms"
            className="inline-flex items-center gap-2 text-sm text-mutedText hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Browse all realms
          </Link>
        </nav>

        {/* Title block */}
        <section className="relative overflow-hidden rounded-3xl glass-panel border border-accentPurple/25 p-8 sm:p-10 mb-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-accentPurple/10 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {realm.gameSlug && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded bg-accentPurple/10 text-accentPurple border border-accentPurple/20">
                  {realm.gameSlug}
                </span>
              )}
              {isOfficial && (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded bg-gradient-to-r from-amber-500/20 to-accentPurple/20 text-amber-300 border border-amber-400/40">
                  <ShieldCheck className="w-3.5 h-3.5" /> Official
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              {realm.name}
            </h1>

            {realm.description && (
              <p className="text-mutedText text-lg leading-relaxed max-w-3xl mb-6">
                {realm.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-mutedText">
              <span className="inline-flex items-center gap-1.5">
                <User className="w-4 h-4" /> {creatorName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> {realm.downloadCount} downloads
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="w-4 h-4" /> {realm.likeCount} likes
              </span>
              {publishedYear !== null && (
                <span className="text-mutedText">Published {publishedYear}</span>
              )}
            </div>

            {realm.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-6">
                {realm.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* What's inside */}
        {(packLine || modCount > 0) && (
          <section className="mb-10">
            <h2 className="text-xl font-extrabold mb-4">What&rsquo;s inside</h2>
            <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
              {packLine && (
                <p className="flex items-center gap-3 text-sm text-slate-300">
                  <PackageCheck className="w-5 h-5 text-accentPurple shrink-0" />
                  <span>
                    Pinned pack source: <span className="font-semibold text-white">{packLine}</span>
                  </span>
                </p>
              )}
              {modCount > 0 && (
                <p className="flex items-center gap-3 text-sm text-slate-300">
                  <PackageCheck className="w-5 h-5 text-accentBlue shrink-0" />
                  <span>
                    <span className="font-semibold text-white">{modCount} mods pinned</span> —
                    versions are locked so everyone gets the same server.
                  </span>
                </p>
              )}
            </div>
          </section>
        )}

        {/* Deploy this realm */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accentPurple/15 via-slate-900 to-accentBlue/15 border border-accentPurple/30 p-8 sm:p-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[300px] bg-accentPurple/10 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accentPurple/10 border border-accentPurple/20 text-xs font-semibold text-accentPurple mb-4">
              <Rocket className="w-3.5 h-3.5" />
              <span>One-click deploy</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-6">
              Deploy this realm on your own PC
            </h2>

            <ol className="space-y-5 mb-8">
              <li className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-accentPurple/15 border border-accentPurple/30 text-accentPurple font-bold flex items-center justify-center text-sm">
                  1
                </span>
                <div>
                  <p className="font-bold">
                    <a
                      href={DOWNLOAD_URL}
                      className="text-accentPurple hover:text-accentPurpleHover underline decoration-accentPurple/40 underline-offset-4 transition-colors"
                    >
                      Download RealmSwap
                    </a>{" "}
                    <span className="text-mutedText font-normal">(free, runs on Windows)</span>
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-accentPurple/15 border border-accentPurple/30 text-accentPurple font-bold flex items-center justify-center text-sm">
                  2
                </span>
                <div>
                  <p className="font-bold">
                    Open the{" "}
                    <span className="inline-flex items-center gap-1 text-accentPurple">
                      <Store className="w-4 h-4" /> Marketplace
                    </span>{" "}
                    tab and search &ldquo;{realm.name}&rdquo;
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-accentPurple/15 border border-accentPurple/30 text-accentPurple font-bold flex items-center justify-center text-sm">
                  3
                </span>
                <div>
                  <p className="font-bold">
                    Click Deploy{" "}
                    <span className="text-mutedText font-normal">
                      — the install is boot-tested and rolls back if anything&rsquo;s wrong.
                    </span>
                  </p>
                </div>
              </li>
            </ol>

            <p className="flex items-start gap-2.5 text-sm text-slate-300 bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-8">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              Every install runs a sandbox boot test before it&rsquo;s called done — a broken
              pack never leaves you with a server that won&rsquo;t start.
            </p>

            <a
              href={DOWNLOAD_URL}
              className="inline-block bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
            >
              Get RealmSwap Free
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-borderDark bg-[#08090c] py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-mutedText">
          <Link href="/realms" className="hover:text-white transition-colors">
            Browse all realms
          </Link>
          <Link href="/" className="hover:text-white transition-colors">
            RealmSwap — host locally, play globally
          </Link>
        </div>
      </footer>
    </div>
  );
}
