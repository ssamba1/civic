"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests/types";
import { submitRequest } from "./actions";

const ERROR_COPY: Record<string, string> = {
  invalid_kind: "Pick a request type.",
  invalid_title: "Add a short summary (1-160 characters).",
  invalid_body: "Add some detail (1-4000 characters).",
  invalid_email: "That email doesn't look right.",
  submit_failed: "Something went wrong. Try again in a moment.",
};

const field =
  "mt-1.5 w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--color-primary)]";
const labelCls = "block text-sm font-medium text-foreground";

export function RequestForm({
  defaultKind = "feature",
  defaultCity = "",
  source,
}: {
  defaultKind?: RequestKind;
  defaultCity?: string;
  source?: string;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await submitRequest({
      kind: form.get("kind") as RequestKind,
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      email: String(form.get("email") ?? ""),
      cityName: String(form.get("cityName") ?? ""),
      source,
    });
    setPending(false);
    if (res.ok) setDone(true);
    else setError(ERROR_COPY[res.error] ?? "Something went wrong.");
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-hairline-strong bg-surface p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-[var(--color-success)]" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Request sent
        </h2>
        <p className="mt-2 text-sm text-subtle">
          Thanks. We read every request. If you left an email, we'll reply
          there.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setDone(false);
            setError(null);
          }}
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="kind" className={labelCls}>
          What do you need?
        </label>
        <select
          id="kind"
          name="kind"
          defaultValue={defaultKind}
          className={field}
        >
          {REQUEST_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className={labelCls}>
          Summary
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={160}
          placeholder="e.g. Bulk-export closed reports as CSV"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="body" className={labelCls}>
          Details
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={4000}
          rows={6}
          placeholder="Tell us what you're trying to do, and why it matters."
          className={`${field} resize-y`}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cityName" className={labelCls}>
            City <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input
            id="cityName"
            name="cityName"
            maxLength={160}
            defaultValue={defaultCity}
            placeholder="Cumming, GA"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>
            Email{" "}
            <span className="font-normal text-subtle">(so we can reply)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={254}
            placeholder="you@city.gov"
            className={field}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="accent"
        isPending={pending}
        className="w-full sm:w-auto"
      >
        Send request
      </Button>
    </form>
  );
}
