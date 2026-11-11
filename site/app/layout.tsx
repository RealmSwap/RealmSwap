import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RealmSwap | Host Locally. Play Globally",
    template: "%s | RealmSwap",
  },
  description:
    "Manage your local game servers with ease. With RealmSwap, swap between Minecraft, Valheim, Project Zomboid, and ARK instantly.",
  keywords: ["game server hosting", "minecraft hosting", "valheim server", "project zomboid server", "game server backups"],
  openGraph: {
    siteName: "RealmSwap",
    type: "website",
    images: ["/og-landing.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-landing.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-white antialiased cyber-grid-bg">{children}</body>
    </html>
  );
}
