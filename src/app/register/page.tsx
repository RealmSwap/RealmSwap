"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, ShieldAlert } from "lucide-react";

function RegisterForm() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to register");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Registration failed. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl">
      {/* Logo Header */}
      <div className="flex flex-col items-center mb-8">
        <Link href="/" className="flex items-center gap-2 mb-2 group">
          <img src="/logo.png" alt="RealmSwap" className="h-12 w-auto scale-[7] -translate-x-16" />
        </Link>
        <p className="text-sm text-mutedText font-medium">Create your account to unlock your game server slots</p>
      </div>

      {/* Form Card */}
      <div className="glass-panel-purple p-8 rounded-2xl border border-accentPurple/20 box-glow-purple">
        {error && (
          <div className="p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          
          {/* Step 1: User details */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-white border-b border-white/5 pb-2 mb-3">Account Details</h3>
            
            <div>
              <label className="text-xs font-semibold text-mutedText tracking-wider uppercase block mb-1.5">
                Display Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                  required
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

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
              <label className="text-xs font-semibold text-mutedText tracking-wider uppercase block mb-1.5">
                Password
              </label>
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
          </div>

            <div className="mt-8">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-white font-bold transition-all duration-200 text-sm shadow-lg shadow-accentPurple/10 border border-accentPurple/30"
              >
                {loading ? "Creating Account..." : "Create Account & Register"}
              </button>
            </div>

        </form>
      </div>

      {/* Footer Link */}
      <p className="text-center text-xs text-mutedText mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors">
          Log In Here
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-background">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accentPurple/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accentBlue/5 rounded-full blur-[100px] pointer-events-none"></div>

      <Suspense fallback={
        <div className="text-center p-8 bg-card rounded-2xl border border-white/5">
          <div className="w-8 h-8 border-2 border-accentPurple border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <span className="text-xs text-mutedText">Loading registration portal...</span>
        </div>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
