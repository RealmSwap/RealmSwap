import React from "react";

/**
 * Shared cards for the site's opengraph-image routes (rendered by next/og's
 * ImageResponse). Plain flexbox and inline styles only — no external fonts,
 * no icon libraries — so the images render anywhere, first try.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const COLORS = {
  bg: "#08090c",
  panel: "#0d0f16",
  text: "#ffffff",
  muted: "#94a3b8",
  accent: "#8b5cf6",
  green: "#34d399",
  amber: "#fbbf24",
  border: "rgba(255,255,255,0.08)",
};

const frame: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: 64,
  backgroundColor: COLORS.bg,
  backgroundImage:
    "radial-gradient(ellipse 800px 400px at 50% -10%, rgba(139,92,246,0.25), transparent), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "auto, 44px 44px, 44px 44px",
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 18px",
        borderRadius: 999,
        border: `1px solid ${color}55`,
        color,
        backgroundColor: `${color}18`,
        fontSize: 26,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 2,
      }}
    >
      {label}
    </div>
  );
}

function Footer({ right }: { right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          🎮
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: COLORS.text, fontSize: 28, fontWeight: 700 }}>RealmSwap</span>
          <span style={{ color: COLORS.muted, fontSize: 20 }}>realmswap.app</span>
        </div>
      </div>
      {right && <div style={{ color: COLORS.muted, fontSize: 22 }}>{right}</div>}
    </div>
  );
}

/** The landing-page brand card. */
export function BrandOg() {
  return (
    <div style={frame}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ color: COLORS.accent, fontSize: 30, fontWeight: 700, textTransform: "uppercase", letterSpacing: 4 }}>
          Free · Local · Boot-tested
        </div>
        <div style={{ color: COLORS.text, fontSize: 92, fontWeight: 800, lineHeight: 1.05, maxWidth: 950 }}>
          A modded server for your friends, running tonight.
        </div>
        <div style={{ color: COLORS.muted, fontSize: 34, maxWidth: 900 }}>
          Pick a game, click deploy, share one invite. No rent, no queues — it runs on your own PC.
        </div>
      </div>
      <Footer right="Windows · free" />
    </div>
  );
}

/** A realm landing-page card. */
export function RealmOg({
  name,
  game,
  badge,
  modCount,
  downloads,
}: {
  name: string;
  game?: string | null;
  badge: string;
  modCount?: number;
  downloads?: number;
}) {
  const facts: string[] = [];
  if (modCount) facts.push(`${modCount} mods pinned`);
  if (downloads) facts.push(`${downloads} downloads`);
  return (
    <div style={frame}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {game ? <Pill label={game} color={COLORS.accent} /> : null}
          <Pill label={badge} color={badge.toLowerCase() === "official" ? COLORS.amber : COLORS.green} />
        </div>
        <div
          style={{
            color: COLORS.text,
            fontSize: name.length > 40 ? 64 : 84,
            fontWeight: 800,
            lineHeight: 1.08,
            maxWidth: 1000,
          }}
        >
          {name}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 34 }}>
          {facts.length ? facts.join("  ·  ") : "A ready-made server setup"}
        </div>
      </div>
      <Footer right="Deploy it free →" />
    </div>
  );
}

/** A hosted status card — lives or dies by the current player count. */
export function StatusOg({
  name,
  game,
  online,
  players,
  maxPlayers,
}: {
  name: string;
  game?: string | null;
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
}) {
  return (
    <div style={frame}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <Pill label={online ? "● Online" : "Offline"} color={online ? COLORS.green : COLORS.muted} />
          {game ? <Pill label={game} color={COLORS.accent} /> : null}
        </div>
        <div style={{ color: COLORS.text, fontSize: name.length > 40 ? 64 : 84, fontWeight: 800, lineHeight: 1.08, maxWidth: 1000 }}>
          {name}
        </div>
        <div style={{ color: online ? COLORS.green : COLORS.muted, fontSize: 40, fontWeight: 700 }}>
          {online
            ? players != null
              ? `${players}${maxPlayers != null ? ` / ${maxPlayers}` : ""} playing right now`
              : "Running — open for friends"
            : "The host's PC is off — check back before game night"}
        </div>
      </div>
      <Footer right="live from realmswap.app" />
    </div>
  );
}
