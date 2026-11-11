import { getHostedStatus } from "@/lib/backend/status";
import { gameLabel } from "@/lib/gameLabel";
import { renderOgCard } from "@/lib/ogImage";
import { StatusOg } from "@/lib/og";

// The status link is the capability; the embed is what people see when it's
// shared, so it shows the live answer the page exists to give.
export const alt = "Live server status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const FRESH_WINDOW_MS = 15 * 60_000;

export default async function Image({ params }: { params: { code: string } }) {
  const status = await getHostedStatus(params.code);
  if (!status) {
    return renderOgCard(<StatusOg name="No status published here" online={false} players={null} maxPlayers={null} />);
  }
  const fresh = Date.now() - new Date(status.updated_at).getTime() < FRESH_WINDOW_MS;
  return renderOgCard(
    <StatusOg
      name={status.name}
      game={gameLabel(status.game)}
      online={status.status === "RUNNING" && fresh}
      players={status.players}
      maxPlayers={status.maxplayers}
    />
  );
}
