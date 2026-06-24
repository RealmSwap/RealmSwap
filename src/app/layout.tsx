import type { Metadata } from "next";
import "./globals.css";
import { ModalProvider } from "@/components/ModalProvider";

export const metadata: Metadata = {
  title: "RealmSwap | Host Locally. Play Globally",
  description: "Manage your local game servers with ease. With RealmSwap, swap between Minecraft, Valheim, Project Zomboid, and ARK instantly.",
  keywords: ["game server hosting", "minecraft hosting", "valheim server", "project zomboid server", "game server backups"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-white antialiased cyber-grid-bg">
        <ModalProvider>
          {children}
        </ModalProvider>
      </body>
    </html>
  );
}
