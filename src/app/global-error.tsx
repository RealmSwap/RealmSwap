"use client";

/**
 * Root error boundary — catches errors thrown by the root layout itself.
 * Must render its own <html>/<body> since the shell is gone.
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#030712] text-slate-100 antialiased">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center border border-white/10 rounded-2xl p-8 bg-slate-900/60">
            <h1 className="text-xl font-extrabold text-white mb-2">RealmSwap hit a problem</h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              An unexpected error stopped the app from loading. Restart RealmSwap, or try again below.
            </p>
            {error?.digest && (
              <p className="text-[10px] font-mono text-slate-600 mb-6">Error ID: {error.digest}</p>
            )}
            <button
              onClick={reset}
              className="px-6 py-2 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-white font-bold text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
