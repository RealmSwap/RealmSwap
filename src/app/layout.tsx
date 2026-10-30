import type { Metadata } from "next";
import "./globals.css";
import { ModalProvider } from "@/components/ModalProvider";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: {
    default: "RealmSwap | Host Locally. Play Globally",
    template: "%s | RealmSwap",
  },
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
        <ToastProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
