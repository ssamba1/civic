"use client";

import {
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  MailCheck,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DemoSignIn } from "@/components/auth/demo-sign-in";
import { createBrowserSupabase } from "@/lib/db/browser-client";

type Mode = "signin" | "signup";

// DEMO ONLY: in demo builds, offer demo persona picker (DemoSignIn component).
// Production builds hide demo credentials entirely.
const DEV_PREFILL = false;
const DEV_EMAIL = "";
const DEV_PASSWORD = "";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";
  const initialError = params.get("error");
  const demoError = params.get("demo_error");

  const [mode, setMode] = useState<Mode>("signin");
  const [showEmail, setShowEmail] = useState(DEV_PREFILL);
  const [email, setEmail] = useState(DEV_PREFILL ? DEV_EMAIL : "");
  const [password, setPassword] = useState(DEV_PREFILL ? DEV_PASSWORD : "");
  const [error, setError] = useState<string | null>(initialError);
  // Positive/neutral notice (e.g. signup confirmation) — kept separate from
  // `error` so a success outcome doesn't render in the red danger box.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | "guest" | null>(null);

  async function handleGoogle() {
    setBusy("google");
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const next = encodeURIComponent(redirectTo);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setBusy(null);
        return;
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setBusy(null);
        return;
      }
      setNotice("Check your email for a confirmation link.");
      setBusy(null);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleGuest() {
    setBusy("guest");
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setError(`Guest sign-in unavailable: ${error.message}`);
      setBusy(null);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  const anyBusy = busy !== null;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--background)] px-4 pt-[max(3rem,env(safe-area-inset-top,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))] text-[var(--foreground)]">
      <style>{`
        @keyframes lf-card-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lf-logo-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lf-fade-down {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lf-card { animation: lf-card-in 320ms cubic-bezier(0.22,1,0.36,1) both; }
        .lf-logo { animation: lf-logo-in 360ms cubic-bezier(0.22,1,0.36,1) 80ms both; }
        .lf-fade-down { animation: lf-fade-down 200ms cubic-bezier(0.22,1,0.36,1) both; }
        .lf-expand {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1);
        }
        .lf-expand.lf-open { grid-template-rows: 1fr; }
        .lf-expand > * { overflow: hidden; min-height: 0; }
        @media (prefers-reduced-motion: reduce) {
          .lf-card, .lf-logo, .lf-fade-down { animation: none; }
          .lf-expand { transition: none; }
        }
      `}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(800px 500px at 50% -10%, rgba(10,132,255,0.25), transparent 60%), radial-gradient(600px 400px at 10% 110%, rgba(90,200,250,0.18), transparent 60%)",
        }}
      />

      <Link
        href="/"
        className="lf-logo relative z-10 mb-6 sm:mb-10 flex items-center gap-2 text-2xl font-semibold tracking-tight"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white shadow-[0_8px_24px_-8px_rgba(10,132,255,0.6)]">
          <MapPin className="h-5 w-5" />
        </span>
        Civic
      </Link>

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="lf-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 sm:p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div key={mode} className="lf-fade-down">
              <h1 className="text-[22px] font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create account"}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                {mode === "signin"
                  ? "Sign in to report and follow civic issues."
                  : "Join Civic to report and follow issues in your city."}
              </p>
            </div>
          </div>

          {error && (
            <div
              key={error}
              id="auth-error"
              role="alert"
              className="lf-fade-down mt-5 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-3 py-2.5 text-[13px] text-[var(--status-danger-fg)]"
            >
              <AlertCircle className="mt-[2px] h-4 w-4 flex-shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {notice && (
            <div
              key={notice}
              role="status"
              className="lf-fade-down mt-5 flex items-start gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-3 py-2.5 text-[13px] text-[var(--status-success-fg)]"
            >
              <MailCheck className="mt-[2px] h-4 w-4 flex-shrink-0" />
              <span className="leading-snug">{notice}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={anyBusy}
            className={`mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--color-border)] bg-white px-4 text-[14px] font-medium text-zinc-900 shadow-sm transition-all hover:shadow-md motion-safe:hover:-translate-y-[1px] active:translate-y-0 disabled:hover:translate-y-0 dark:bg-white dark:text-zinc-900 ${
              busy === "google" ? "opacity-70" : "disabled:opacity-50"
            }`}
          >
            {busy === "google" ? (
              <Spinner className="h-5 w-5 text-zinc-900" />
            ) : (
              <GoogleGlyph className="h-5 w-5" />
            )}
            {busy === "google"
              ? "Redirecting…"
              : mode === "signin"
                ? "Continue with Google"
                : "Sign up with Google"}
          </button>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          {!showEmail && (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              disabled={anyBusy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-transparent text-[13.5px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--color-primary-light)] disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              Continue with email
            </button>
          )}
          <div className={`lf-expand ${showEmail ? "lf-open" : ""}`}>
            <div>
              <form onSubmit={handleEmail} className="space-y-3 pt-px">
                <FieldIcon icon={<Mail className="h-4 w-4" />}>
                  <label htmlFor="auth-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-describedby={error ? "auth-error" : undefined}
                    className="h-12 w-full bg-transparent pl-10 pr-3 text-base sm:text-[14px] outline-none placeholder:text-[var(--color-muted)]"
                  />
                </FieldIcon>
                <FieldIcon icon={<Lock className="h-4 w-4" />}>
                  <label htmlFor="auth-password" className="sr-only">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "signup" ? "At least 8 characters" : "Password"
                    }
                    aria-describedby={error ? "auth-error" : undefined}
                    className="h-12 w-full bg-transparent pl-10 pr-3 text-base sm:text-[14px] outline-none placeholder:text-[var(--color-muted)]"
                  />
                </FieldIcon>

                <button
                  type="submit"
                  disabled={anyBusy}
                  className={`group mt-1 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary)] text-[14px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(10,132,255,0.7)] transition-all hover:bg-[var(--color-primary-hover)] motion-safe:hover:-translate-y-[1px] active:translate-y-0 disabled:hover:translate-y-0 ${
                    busy === "email" ? "opacity-70" : "disabled:opacity-60"
                  }`}
                >
                  {busy === "email" ? (
                    <>
                      <Spinner className="h-4 w-4 text-white" />
                      {mode === "signin" ? "Signing in…" : "Creating account…"}
                    </>
                  ) : (
                    <>
                      {mode === "signin" ? "Sign in" : "Create account"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGuest}
            disabled={anyBusy}
            className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)] ${
              busy === "guest" ? "opacity-60" : "disabled:opacity-50"
            }`}
          >
            {busy === "guest" ? (
              <>
                <Spinner className="h-4 w-4" />
                Signing in…
              </>
            ) : (
              "Continue as guest"
            )}
          </button>

          <DemoSignIn error={demoError} />
        </div>

        <p className="mt-6 text-center text-[13px] text-[var(--color-muted)]">
          {mode === "signin" ? (
            <>
              New to Civic?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setNotice(null);
                  setShowEmail(false);
                }}
                className="inline-flex sm:inline items-center min-h-[44px] sm:min-h-0 font-medium text-[var(--color-primary)] hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setNotice(null);
                  setShowEmail(false);
                }}
                className="inline-flex sm:inline items-center min-h-[44px] sm:min-h-0 font-medium text-[var(--color-primary)] hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--color-muted)]">
          By continuing you agree to Civic's{" "}
          <Link
            href="/terms"
            className="font-medium text-[var(--foreground)] hover:underline"
          >
            Terms
          </Link>{" "}
          and acknowledge the{" "}
          <Link
            href="/privacy"
            className="font-medium text-[var(--foreground)] hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function FieldIcon({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group/field relative rounded-xl border border-[var(--color-border)] bg-[var(--background)] transition-colors focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] transition-colors group-focus-within/field:text-[var(--color-primary)]">
        {icon}
      </span>
      {children}
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.44.36-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
