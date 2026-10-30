import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-100 font-sans p-6">
      <div className="glass-panel rounded-2xl border border-white/10 p-8 max-w-md w-full text-center shadow-2xl">
        <p className="text-5xl mb-4">🗺️</p>
        <h1 className="text-xl font-extrabold text-white mb-2">Page not found</h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          That page doesn&apos;t exist — it may have moved. Your servers are fine.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-5 py-2 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-white font-bold text-sm transition-colors shadow-lg shadow-accentPurple/20"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
