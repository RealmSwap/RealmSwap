"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCent, Sparkles, Check, Loader2, ExternalLink } from "lucide-react";

type Plan = {
  id: string;
  unit_amount: number | null;
  currency: string | null;
  interval: string | null;
  plan: string | null;
  active_slots: number | null;
};

function money(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency ?? "usd").toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

async function openExternal(url?: string) {
  if (!url) return;
  // Electron routes http(s) window.open to the OS browser (setWindowOpenHandler);
  // in a plain browser this opens a new tab.
  window.open(url, "_blank", "noopener");
}

export default function BillingView({
  plans,
  currentPlan,
  currentSlots,
}: {
  plans: Plan[];
  currentPlan: string;
  currentSlots: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const isPaid = currentPlan !== "FREE";

  // After returning from Stripe Checkout the webhook writes the subscription
  // asynchronously — poll the refresh endpoint until the plan updates.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    setConfirming(true);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 8 && !cancelled; i++) {
        const res = await fetch("/api/billing/refresh", { method: "POST" }).catch(() => null);
        const data = await res?.json().catch(() => null);
        if (data?.entitlement?.isActive) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (cancelled) return;
      // Drop the query param and re-render server data.
      window.history.replaceState({}, "", "/dashboard/billing");
      setConfirming(false);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function subscribe(priceId: string) {
    setError("");
    setBusy(priceId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      await openExternal(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setError("");
    setBusy("manage");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open the billing portal.");
      await openExternal(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <BadgeCent className="w-6 h-6 text-accentPurple" />
            <span>Subscription Billing</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Choose a plan to unlock more active server slots, or manage your current subscription.</p>
        </div>

        {confirming && (
          <div className="mb-6 p-4 rounded-xl bg-accentPurple/10 border border-accentPurple/30 flex items-center gap-3 text-sm text-accentPurple">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Confirming your subscription…</span>
          </div>
        )}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
        )}

        {/* Current plan */}
        <div className="mb-8 p-5 rounded-2xl bg-slate-950/40 border border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs text-mutedText block">Current plan</span>
            <span className="text-xl font-extrabold text-white">{currentPlan === "FREE" ? "Free" : `${currentPlan} Plan`}</span>
            {currentSlots != null && (
              <span className="text-xs text-accentPurple font-bold block mt-0.5">{currentSlots} server slot{currentSlots === 1 ? "" : "s"}</span>
            )}
          </div>
          {isPaid && (
            <button
              onClick={manage}
              disabled={busy === "manage"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-accentPurple/40 text-accentPurple hover:bg-accentPurple/10 text-sm font-bold transition-all disabled:opacity-50"
            >
              {busy === "manage" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage subscription
            </button>
          )}
        </div>

        {/* Plans */}
        {plans.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/5 bg-slate-950/40 text-center text-sm text-mutedText">
            No plans are available yet. (Once Stripe products are synced, they'll appear here.)
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-5">
            {plans.map((p) => {
              const isCurrent = p.plan === currentPlan;
              return (
                <div key={p.id} className={`glass-panel rounded-2xl border p-6 flex flex-col ${isCurrent ? "border-accentPurple/50 box-glow-purple" : "border-white/5"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-extrabold text-lg text-white">{p.plan ?? "Plan"}</h3>
                    {isCurrent && <Check className="w-4 h-4 text-accentPurple" />}
                  </div>
                  <div className="mb-4">
                    <span className="text-2xl font-extrabold text-white">{money(p.unit_amount, p.currency)}</span>
                    <span className="text-xs text-mutedText">/{p.interval ?? "mo"}</span>
                  </div>
                  <div className="text-sm text-slate-300 mb-6 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accentPurple" />
                    {p.active_slots ?? "—"} server slot{p.active_slots === 1 ? "" : "s"}
                  </div>
                  <button
                    onClick={() => subscribe(p.id)}
                    disabled={isCurrent || busy === p.id}
                    className="mt-auto w-full py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurpleHover disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-sm transition-all inline-flex items-center justify-center gap-2"
                  >
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isCurrent ? "Current plan" : "Subscribe"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
