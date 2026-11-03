import Link from "next/link";
import { Download, Heart } from "lucide-react";

/**
 * Shared realm card for the marketing site — used by the homepage "Featured
 * Realms" section and the /realms browse index. Visual language matches the
 * homepage: dark glass panel, game badge, tag pills, like/download counts.
 *
 * Renders as a link to /r/<slug> when a slug exists; realms without a slug
 * can't be linked, so they fall back to a plain (non-interactive) card.
 */
export type RealmCardProps = {
  slug: string | null;
  name: string;
  description?: string | null;
  gameSlug?: string | null;
  tags?: string[];
  priceCents?: number;
  currency?: string;
  likeCount?: number;
  downloadCount?: number;
};

export default function RealmCard({
  slug,
  name,
  description,
  gameSlug,
  tags = [],
  priceCents = 0,
  currency = "usd",
  likeCount = 0,
  downloadCount = 0,
}: RealmCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-bold text-lg text-white">{name}</h3>
        {gameSlug && (
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-accentPurple/10 text-accentPurple border border-accentPurple/20 whitespace-nowrap">
            {gameSlug}
          </span>
        )}
      </div>
      {description && (
        <p className="text-mutedText text-sm mb-4 line-clamp-3 flex-1">{description}</p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-4 text-xs text-mutedText">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5" /> {likeCount}
          </span>
          <span className="flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> {downloadCount}
          </span>
        </div>
        <span className="font-mono font-bold text-slate-200">
          {priceCents === 0
            ? "Free"
            : (priceCents / 100).toLocaleString("en-US", {
                style: "currency",
                currency: (currency || "usd").toUpperCase(),
              })}
        </span>
      </div>
    </>
  );

  const classes =
    "glass-panel p-6 rounded-2xl border border-white/5 hover:border-accentPurple/25 transition-all duration-300 flex flex-col h-full";

  if (slug) {
    return (
      <Link href={`/r/${slug}`} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
