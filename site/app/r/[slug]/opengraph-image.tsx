import { getRealmBySlug } from "@/lib/backend/realms";
import { gameLabel } from "@/lib/gameLabel";
import { renderOgCard } from "@/lib/ogImage";
import { RealmOg } from "@/lib/og";

// Realm links get pasted into Discord and group chats; this is the embed.
export const alt = "Realm — deploy it free with RealmSwap";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: { slug: string } }) {
  const realm = await getRealmBySlug(params.slug);
  if (!realm) {
    return renderOgCard(<RealmOg name="This realm doesn't exist (or went private)" badge="RealmSwap" />);
  }
  return renderOgCard(
    <RealmOg
      name={realm.name}
      game={realm.gameSlug ? gameLabel(realm.gameSlug) : null}
      badge={realm.verifiedLevel === "OFFICIAL" ? "Official" : realm.verifiedLevel === "VERIFIED" ? "Verified" : "Community"}
      modCount={Array.isArray(realm.payload?.mods) ? (realm.payload?.mods as unknown[]).length : 0}
      downloads={realm.downloadCount}
    />
  );
}
