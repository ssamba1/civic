"use client";

import { AlertCircle, LogIn } from "lucide-react";
import { useState } from "react";

import { signInDemo } from "@/app/login/actions";
import { DEMO_ACCOUNTS } from "@/lib/demo-auth";

/**
 * Demo persona sign-in. DEMO ONLY — credentials are baked in (see demo-auth.ts)
 * and gate nothing sensitive. Shown unconditionally so the deployed hackathon
 * demo can log in as each surface. Quick-pick chips prefill the fields; submit
 * posts to the signInDemo server action which sets the cookie and redirects.
 */
export function DemoSignIn({ error }: { error?: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const personas = DEMO_ACCOUNTS.map((a) => ({
    username: a.username,
    password: a.password,
    label: a.role === "team" ? a.label : a.label,
    role: a.role,
  }));

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--background)]/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Demo accounts
        </p>
        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-primary)]">
          Demo
        </span>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-3 py-2 text-[12px] text-[var(--color-danger)]">
          <AlertCircle className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      <form action={signInDemo} className="mt-3 space-y-2.5">
        <input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username (e.g. teamtest1)"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--background)] px-3 text-base sm:text-[14px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--background)] px-3 text-base sm:text-[14px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <button
          type="submit"
          className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-foreground)] text-[14px] font-semibold text-[var(--background)] transition-all hover:-translate-y-[1px] active:translate-y-0"
        >
          <LogIn className="h-4 w-4" />
          Sign in to demo
        </button>
      </form>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] text-[var(--color-muted)]">
          Quick fill
        </p>
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => {
                setUsername(p.username);
                setPassword(p.password);
              }}
              title={`${p.label} — ${p.username}`}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                username === p.username
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50 hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {p.role === "team" ? p.username : p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
