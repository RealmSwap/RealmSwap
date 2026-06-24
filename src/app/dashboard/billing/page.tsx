import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import Link from "next/link";
import { ArrowLeft, BadgeCent, Sparkles, LayoutDashboard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const currentPlanName = user.subscription?.plan || "STARTER";
  const currentPlanPrice = currentPlanName === "STARTER" ? "$9/mo" : currentPlanName === "PARTY" ? "$19/mo" : "$39/mo";
  const currentPlanSlots = currentPlanName === "STARTER" ? "1 Server Slot" : currentPlanName === "PARTY" ? "2 Server Slots" : "4 Server Slots";

  return (
    <div className="min-h-screen flex bg-background text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>
          <nav className="p-4 space-y-1">
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 transition-all">
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Dashboard</span>
            </Link>
            <Link href="/dashboard/servers/new" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 transition-all">
              <PlusIcon className="w-4 h-4 text-slate-500" />
              <span>Create Server</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 px-6 py-8 relative overflow-hidden">
        <div className="mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <BadgeCent className="w-6 h-6 text-accentPurple" />
            <span>Subscription Billing</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Manage credit cards, view invoices, or change your active server slot hosting tier.</p>
        </div>

        {/* Coming Soon Over */}
        <div className="relative">
          <div className="absolute inset-0 bg-[#08090c]/40 backdrop-blur-[6px] z-10 flex flex-col items-center justify-center rounded-2xl border border-accentPurple/20">
            <div className="glass-panel p-8 rounded-2xl border border-accentPurple/30 text-center max-w-sm box-glow-purple mx-4">
              <Sparkles className="w-8 h-8 text-accentPurple mx-auto mb-4 animate-float" />
              <h3 className="font-extrabold text-lg text-white mb-2">Stripe Billing Portal</h3>
              <p className="text-xs text-mutedText leading-relaxed mb-6">
                Upgrade slots, handle recurring payments, apply coupon codes, and view receipts using secure Stripe checkout flows.
              </p>
              <span className="inline-block bg-accentPurple/20 border border-accentPurple/40 text-accentPurple text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                Coming Soon in v1.0 Production
              </span>
            </div>
          </div>

          {/* Billing Form Mockup */}
          <div className="grid md:grid-cols-12 gap-8 opacity-35 select-none pointer-events-none">
            
            {/* Current plan summary */}
            <div className="md:col-span-5 glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
              <h3 className="font-bold text-sm text-white border-b border-white/5 pb-2">Active Subscription</h3>
              <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                <span className="text-xs text-mutedText block">Current Tier</span>
                <span className="text-xl font-extrabold text-white block mt-0.5">{currentPlanName} Plan</span>
                <span className="text-xs text-accentPurple font-bold block mt-1">{currentPlanSlots} online concurrently</span>
              </div>
              <div className="flex justify-between text-xs font-semibold px-1">
                <span className="text-mutedText">Monthly Cost</span>
                <span className="text-white font-bold">{currentPlanPrice}</span>
              </div>
            </div>

            {/* Credit Card Detail Form */}
            <div className="md:col-span-7 glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
              <h3 className="font-bold text-sm text-white border-b border-white/5 pb-2">Update Payment Details</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-mutedText block mb-1">Cardholder Name</span>
                  <input type="text" value="Cody Gamer" disabled className="w-full bg-slate-950 px-3 py-2 rounded text-xs text-slate-300" />
                </div>
                <div>
                  <span className="text-xs text-mutedText block mb-1">Card Details</span>
                  <input type="text" value="•••• •••• •••• 4242" disabled className="w-full bg-slate-950 px-3 py-2 rounded text-xs text-slate-300" />
                </div>
                <button className="px-4 py-2 bg-accentPurple text-white rounded font-bold text-xs">Save Card</button>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

function PlusIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  );
}
