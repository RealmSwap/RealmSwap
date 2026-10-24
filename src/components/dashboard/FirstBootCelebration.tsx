"use client";

import React from "react";
import { motion } from "framer-motion";
import { Link2, QrCode, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const CONFETTI_COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#f87171"];

/**
 * One-time celebration for a server's very first boot: confetti burst plus
 * the two things a fresh host needs — the Join Info panel (QR invite) and a
 * copyable public status link. Shown once per browser (localStorage guard in
 * DashboardView) and only for a first boot seen live (recency guard).
 */
export function FirstBootCelebration({
  server,
  onClose,
  onOpenJoinInfo,
}: {
  server: any;
  onClose: () => void;
  onOpenJoinInfo: () => void;
}) {
  const { addToast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const shareLink = server.statusShareCode
    ? `${window.location.origin}/s/${server.statusShareCode}`
    : null;

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("error", "Could not copy the link");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Confetti burst */}
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {Array.from({ length: 60 }, (_, i) => {
          const style = {
            width: 6 + (i % 4) * 2,
            height: 6 + (i % 3) * 3,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            borderRadius: i % 3 === 1 ? "50%" : 2,
          };
          return (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/4"
              style={style}
              initial={{ x: 0, y: -30, opacity: 1, rotate: 0 }}
              animate={{
                x: ((i * 137) % 500) - 250,
                y: 150 + ((i * 89) % 300),
                opacity: 0,
                rotate: ((i * 53) % 720) - 360,
              }}
              transition={{ duration: 1.6 + (i % 5) * 0.2, delay: (i % 10) * 0.04, ease: "easeOut" }}
            />
          );
        })}
      </div>

      <div
        className="relative w-full max-w-md bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-2xl font-extrabold text-white">Your server is live!</h2>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          &lsquo;{server.name}&rsquo; just came online for the first time. Time to invite some friends.
        </p>

        <div className="mt-6 space-y-2">
          <button
            onClick={onOpenJoinInfo}
            className="w-full py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/80 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Open Join Info
          </button>
          {shareLink && (
            <button
              onClick={copyLink}
              className="w-full py-2.5 rounded-xl bg-slate-800 border border-white/5 hover:border-emerald-500/40 text-slate-200 hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              title="Anyone with this link can see if the server is up — no login needed"
            >
              <Link2 className="w-4 h-4" />
              {copied ? "Copied!" : "Copy status page link"}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
