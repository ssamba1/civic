"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleGuest() {
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setError(`Guest sign-in unavailable (enable Anonymous in Supabase Auth): ${error.message}`);
      setBusy(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <MapPin className="h-5 w-5" />
        </span>
        Civic
      </Link>

      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-zinc-900">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Residents and city staff sign in here.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="you@example.com"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 h-11 w-full rounded-full bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={handleGuest}
          disabled={busy}
          className="mt-3 h-11 w-full rounded-full border border-zinc-300 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          Continue as guest
        </button>
      </form>
    </div>
  );
}
