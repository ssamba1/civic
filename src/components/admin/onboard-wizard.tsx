"use client";

import { ArrowLeft, ArrowRight, ExternalLink, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  fetchBoundaryAction,
  goLiveAction,
  type ProvisionSeedResult,
  provisionAndSeedAction,
  resolveCityAction,
} from "@/app/admin/onboard/actions";
import { BoundaryMap } from "@/components/admin/boundary-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { US_STATES } from "@/lib/onboarding/state-fips";
import type { BoundaryGeometry, CityCandidate } from "@/lib/onboarding/tiger";

const STEPS = [
  { id: "identify", label: "Identify" },
  { id: "boundary", label: "Boundary" },
  { id: "preview", label: "Preview" },
  { id: "launch", label: "Launch" },
];

function km2(areaLandM2: number): string {
  return `${(areaLandM2 / 1e6).toFixed(1)} km²`;
}

export function OnboardWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [stateAbbr, setStateAbbr] = useState("GA");
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<CityCandidate[]>([]);
  const [selectedGeoid, setSelectedGeoid] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionSeedResult | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [boundary, setBoundary] = useState<BoundaryGeometry | null>(null);

  const selected = candidates.find((c) => c.geoid === selectedGeoid) ?? null;

  // Fetch + preview the selected candidate's boundary on the map (Step 2).
  useEffect(() => {
    if (step !== 1 || !selectedGeoid) return;
    const candidate = candidates.find((c) => c.geoid === selectedGeoid);
    if (!candidate) return;
    setBoundary(null);
    let cancelled = false;
    fetchBoundaryAction(candidate).then((r) => {
      if (!cancelled && r.ok) setBoundary(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [step, selectedGeoid, candidates]);

  function find() {
    setError(null);
    startTransition(async () => {
      const res = await resolveCityAction({ name, state: stateAbbr });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.length === 0) {
        setError(
          `No Census match for "${name}, ${stateAbbr}". Check the spelling.`,
        );
        return;
      }
      setCandidates(res.data);
      setSelectedGeoid(res.data[0].geoid);
      setStep(1);
    });
  }

  function provision() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await provisionAndSeedAction({ candidate: selected });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setStep(2);
    });
  }

  function goLive() {
    if (!result) return;
    startTransition(async () => {
      const res = await goLiveAction({
        cityId: result.cityId,
        slug: result.slug,
      });
      setConfirmLive(false);
      if (!res.ok) {
        toast(`Go-live failed: ${res.error}`, "error");
        return;
      }
      toast(`${name} is live at /city/${result.slug}`, "success");
      router.push("/admin/cities");
    });
  }

  function copyPreview() {
    if (!result) return;
    const url = `${window.location.origin}/city/${result.slug}`;
    navigator.clipboard?.writeText(url).then(
      () => toast("Preview link copied", "success"),
      () => toast("Could not copy link", "error"),
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
        Onboard a city
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Type a city, confirm its limits, and seed a live preview in minutes.
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <Stepper steps={STEPS} current={step} onStepClick={setStep} />

        <div className="mt-6">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}

          {/* Step 0 — Identify */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label="City name" htmlFor="city-name" required>
                <Input
                  id="city-name"
                  value={name}
                  placeholder="Cumming"
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="State" htmlFor="city-state" required>
                <Select
                  id="city-state"
                  value={stateAbbr}
                  onChange={(e) => setStateAbbr(e.target.value)}
                >
                  {US_STATES.map((s) => (
                    <option key={s.abbr} value={s.abbr}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end">
                <Button
                  variant="accent"
                  isPending={pending}
                  disabled={!name.trim() || pending}
                  onClick={find}
                >
                  Find city
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 1 — Boundary / disambiguate */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[var(--color-muted)]">
                {candidates.length > 1
                  ? "Multiple Census matches — pick the right one."
                  : "Confirm the Census match."}
              </p>
              <div className="h-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                {boundary ? (
                  <BoundaryMap boundary={boundary} />
                ) : (
                  <div
                    className="skeleton h-full w-full"
                    role="status"
                    aria-busy="true"
                    aria-label="Loading boundary preview"
                  />
                )}
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Boundary candidate</legend>
                {candidates.map((c) => (
                  <label
                    key={c.geoid}
                    className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                  >
                    <input
                      type="radio"
                      name="candidate"
                      value={c.geoid}
                      checked={selectedGeoid === c.geoid}
                      onChange={() => setSelectedGeoid(c.geoid)}
                      className="accent-[var(--color-primary)]"
                    />
                    <span className="flex-1">
                      <span className="text-sm font-medium text-[var(--color-foreground)]">
                        {c.displayName}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-muted)]">
                        {c.type} · {km2(c.areaLandM2)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setStep(0)}
                  disabled={pending}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  variant="accent"
                  isPending={pending}
                  disabled={!selected || pending}
                  onClick={provision}
                >
                  Provision &amp; seed
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Preview */}
          {step === 2 && result && (
            <div className="flex flex-col gap-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <p className="text-sm text-[var(--color-foreground)]">
                  Seeded{" "}
                  <span className="font-semibold">{result.inserted}</span>{" "}
                  reports into <span className="font-semibold">{name}</span>.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    variant={
                      result.source === "synthetic" ? "warning" : "success"
                    }
                  >
                    {result.source === "synthetic" ? "Demo data" : "Real data"}
                  </Badge>
                  {result.degraded && (
                    <span className="text-xs text-[var(--color-muted)]">
                      {result.degraded}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <Button asChild variant="outline">
                  <Link href={`/city/${result.slug}`} target="_blank">
                    Open dashboard
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="accent" onClick={() => setStep(3)}>
                  Continue to launch
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Launch */}
          {step === 3 && result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
                  Share preview
                </h2>
                <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
                  Stays private (not public). Share the link for a sales call.
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={copyPreview}
                >
                  Copy preview link
                </Button>
              </div>
              <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
                  Go live
                </h2>
                <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
                  Publish at /city/{result.slug}; residents can report.
                </p>
                <Button
                  variant="accent"
                  className="mt-3"
                  onClick={() => setConfirmLive(true)}
                >
                  <Rocket className="size-4" aria-hidden="true" />
                  Go live
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmLive}
        onClose={() => setConfirmLive(false)}
        title={`Publish ${name} publicly?`}
        description="Residents will be able to submit reports and the dashboard will be public. You can't quietly undo this."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLive(false)}>
              Cancel
            </Button>
            <Button variant="accent" isPending={pending} onClick={goLive}>
              Go live
            </Button>
          </>
        }
      />
    </div>
  );
}
