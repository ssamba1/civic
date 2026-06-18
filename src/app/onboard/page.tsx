import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/db/ssr-client";
import { OnboardWizard } from "./onboard-wizard";

export const metadata: Metadata = {
  title: "Set up your city | Civic",
  description:
    "Onboard your municipality: define your city, teams, routing, and staff accounts.",
};

// Reads the session per request — never statically cache the auth gate.
export const dynamic = "force-dynamic";

export default async function OnboardPage() {
  const user = await getAuthUser();

  if (!user) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Set up your city
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            Sign in (or create an account) to provision your city. You'll become
            its admin and can add your team in a few steps.
          </p>
          <Button asChild variant="accent" className="mt-6">
            <Link href="/login?redirect=/onboard">Sign in to continue</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh">
      <OnboardWizard adminEmail={user.email ?? null} />
    </main>
  );
}
