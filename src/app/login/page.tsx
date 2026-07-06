"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, ShieldAlert, Sparkles } from "lucide-react";

export default function LoginPage({ searchParams }: { searchParams: { link?: string } }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to log in");
      }

      let dest = "/dashboard";
      if (searchParams?.link) {
        dest += `?link=${encodeURIComponent(searchParams.link)}`;
      }
      router.push(dest);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-background">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accentPurple/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accentBlue/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md">
        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/start" className="flex items-center gap-2 mb-2 group">
            <img src="/logo.png" alt="RealmSwap" className="h-12 w-auto scale-[7] -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </Link>
          <p className="text-sm text-mutedText">Log in to manage your active server slots</p>
        </div>

        {/* Card Form */}
        <div className="glass-panel-purple p-8 rounded-2xl border border-accentPurple/20 box-glow-purple">
          <h2 className="text-xl font-bold mb-6 text-center text-white flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accentPurple" />
            Welcome Back
          </h2>

          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-mutedText tracking-wider uppercase block mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                  required
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-mutedText tracking-wider uppercase">
                  Password
                </label>
                <Link 
                  href="/forgot-password" 
                  className="text-xs text-accentPurple hover:text-accentPurpleHover transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                  required
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-white font-bold transition-all duration-200 text-sm shadow-lg shadow-accentPurple/10 border border-accentPurple/30"
            >
              {loading ? "Logging In..." : "Log In"}
            </button>
          </form>

          {/* Test credentials helper */}
          <div className="mt-6 pt-5 border-t border-white/5 text-center">
            <span className="text-xs text-mutedText block mb-1">Testing Demo Credentials:</span>
            <code className="text-[10px] bg-slate-950 px-2 py-1 rounded border border-white/5 text-accentBlue">
              demo@realmswap.gg / password123
            </code>
          </div>
        </div>

        {/* Footer Link */}
        <p className="text-center text-xs text-mutedText mt-6">
          Don't have an account?{" "}
          <Link href="/register" className="text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors">
            Register Here
          </Link>
        </p>
      </div>
    </div>
  );
}
