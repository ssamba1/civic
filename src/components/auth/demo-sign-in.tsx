"use client";

import { AlertCircle, LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { signInDemo } from "@/app/login/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_ACCOUNTS } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { cn } from "@/lib/utils/cn";

/**
 * Demo persona sign-in. DEMO ONLY. Credentials are baked in (see demo-auth.ts)
 * and gate nothing sensitive. Shown unconditionally so the deployed hackathon
 * demo can log in as each surface. Quick-pick chips prefill the fields; submit
 * posts to the signInDemo server action which sets the cookie and redirects.
 */
export function DemoSignIn({ error }: { error?: string | null }) {
  const redirectTo = useSearchParams().get("redirect");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Live deployments (civic-testing): real Supabase auth only.
  if (!DEMO_MODE) return null;

  const personas = DEMO_ACCOUNTS.map((a) => ({
    username: a.username,
    password: a.password,
    label: a.label,
    role: a.role,
  }));

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Demo accounts
        </p>
        <Badge>Demo</Badge>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-3 py-2 text-[12px] text-[var(--status-danger-fg)]">
          <AlertCircle className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      <form action={signInDemo} className="mt-3 space-y-2.5">
        {redirectTo && (
          <input type="hidden" name="redirect" value={redirectTo} />
        )}
        <input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username (e.g. teamtest1)"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 w-full rounded-[var(--radius-md)] border border-hairline-strong bg-background px-3 text-base text-foreground outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] sm:text-[14px]"
        />
        <input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="h-11 w-full rounded-[var(--radius-md)] border border-hairline-strong bg-background px-3 text-base text-foreground outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] sm:text-[14px]"
        />
        <DemoSubmit />
      </form>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] text-faint">Quick fill</p>
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => {
                setUsername(p.username);
                setPassword(p.password);
              }}
              title={`${p.label}, ${p.username}`}
              className={cn(
                "rounded-[var(--radius-md)] border px-2.5 py-1 text-[11px] font-medium transition-colors motion-safe:active:scale-95 motion-safe:transition-transform motion-safe:duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                username === p.username
                  ? "border-[var(--accent)] bg-accent-soft text-accent-text"
                  : "border-hairline text-subtle hover:border-hairline-strong hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" isPending={pending} size="lg" className="w-full">
      <LogIn className="h-4 w-4" />
      Sign in to demo
    </Button>
  );
}
