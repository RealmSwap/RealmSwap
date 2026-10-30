"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Route-level error boundary. Without this, any render exception in the
 * Electron shell white-screens the whole app.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-100 font-sans p-6">
      <div className="glass-panel rounded-2xl border border-red-500/30 p-8 max-w-md w-full text-center shadow-2xl">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          This screen hit an unexpected error. Your servers and worlds are safe — try again, or head back to the dashboard.
        </p>
        {error?.digest && (
          <p className="text-[10px] font-mono text-slate-600 mb-6">Error ID: {error.digest}</p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-white font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-accentPurple/20"
          >
            <RotateCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 font-bold text-sm transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
