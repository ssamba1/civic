"use client";

import { Check, Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ALL_CATEGORIES,
  buildDefaultRouting,
  categoryLabel,
  type RoutingMap,
  routingToTeamCategories,
  slugify,
  TEAM_PRESETS,
} from "@/lib/onboarding/presets";
import type {
  CredentialDelivery,
  OnboardCityInput,
  ProvisionResult,
  RosterGranularity,
  RosterPersonInput,
  StaffRole,
} from "@/lib/onboarding/types";
import { geocodeCity, provisionCity } from "./actions";

const STEPS = ["city", "teams", "routing", "roster", "review"] as const;
type StepName = (typeof STEPS)[number];
const STEP_LABELS: Record<StepName, string> = {
  city: "City",
  teams: "Teams",
  routing: "Routing",
  roster: "Staff",
  review: "Review",
};

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  staff_supervisor: "Supervisor",
  staff_dispatcher: "Dispatcher",
};

interface CityState {
  name: string;
  state: string;
  slug: string;
  center: { lat: number; lng: number } | null;
  geoDisplay: string | null;
}

function emptyPerson(teamKey: string): RosterPersonInput {
  return { name: "", email: "", role: "staff_dispatcher", teamKey };
}

export function OnboardWizard({ adminEmail }: { adminEmail: string | null }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [city, setCity] = useState<CityState>({
    name: "",
    state: "",
    slug: "",
    center: null,
    geoDisplay: null,
  });

  // Team enable + rename. Default: all 11 presets enabled, preset labels.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TEAM_PRESETS.map((t) => [t.id, true])),
  );
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEAM_PRESETS.map((t) => [t.id, t.label])),
  );

  const [routing, setRouting] = useState<RoutingMap>(() =>
    buildDefaultRouting(TEAM_PRESETS.map((t) => t.id)),
  );

  const [granularity, setGranularity] =
    useState<RosterGranularity>("per_person");
  const [delivery, setDelivery] = useState<CredentialDelivery>("temp_password");
  const [roster, setRoster] = useState<RosterPersonInput[]>([]);
  const [sharedEmails, setSharedEmails] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const enabledKeys = useMemo<string[]>(
    () => TEAM_PRESETS.filter((t) => enabled[t.id]).map((t) => t.id),
    [enabled],
  );

  const effectiveSlug = city.slug.trim() || slugify(city.name);

  // Keep routing valid against the enabled set: reset any category pointing at
  // a now-disabled team to its default, preserving still-valid manual edits.
  const syncDownstream = useCallback(() => {
    const valid = new Set(enabledKeys);
    const defaults = buildDefaultRouting(enabledKeys);
    setRouting((prev) => {
      const next = { ...defaults };
      for (const cat of ALL_CATEGORIES) {
        if (prev[cat] && valid.has(prev[cat])) next[cat] = prev[cat];
      }
      return next;
    });
    setRoster((prev) =>
      prev.map((p) =>
        valid.has(p.teamKey) ? p : { ...p, teamKey: enabledKeys[0] ?? "" },
      ),
    );
    setSharedEmails((prev) =>
      Object.fromEntries(enabledKeys.map((k) => [k, prev[k] ?? ""])),
    );
  }, [enabledKeys]);

  const goNext = useCallback(async () => {
    setError(null);

    if (step === "city") {
      if (!city.name.trim() || !city.state.trim()) {
        setError("Enter your city name and state.");
        return;
      }
      // Geocode for map centering; never block on failure (boundary deferred).
      setBusy(true);
      try {
        const geo = await geocodeCity(city.name, city.state);
        setCity((c) => ({
          ...c,
          center: geo ? { lat: geo.lat, lng: geo.lng } : null,
          geoDisplay: geo?.displayName ?? null,
        }));
      } finally {
        setBusy(false);
      }
    }

    if (step === "teams") {
      if (enabledKeys.length === 0) {
        setError("Enable at least one team.");
        return;
      }
      syncDownstream();
    }

    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }, [step, city, enabledKeys, syncDownstream]);

  const goBack = useCallback(() => {
    setError(null);
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    const teamCategories = routingToTeamCategories(routing);
    const input: OnboardCityInput = {
      city: {
        name: city.name.trim(),
        state: city.state.trim(),
        slug: effectiveSlug,
        center: city.center,
      },
      teams: enabledKeys.map((k) => ({
        teamKey: k,
        label: (labels[k] ?? k).trim() || k,
        categories: teamCategories[k] ?? [],
      })),
      granularity,
      roster:
        granularity === "per_person"
          ? roster.filter((p) => p.email.trim().length > 0)
          : [],
      sharedAccounts:
        granularity === "shared_per_team"
          ? enabledKeys
              .map((k) => ({ teamKey: k, email: (sharedEmails[k] ?? "").trim() }))
              .filter((s) => s.email.length > 0)
          : [],
      delivery,
    };
    try {
      const res = await provisionCity(input);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      setBusy(false);
      setResult(res);
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  }, [
    city,
    effectiveSlug,
    enabledKeys,
    labels,
    routing,
    granularity,
    roster,
    sharedEmails,
    delivery,
  ]);

  if (result) {
    return <ResultScreen result={result} delivery={delivery} />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <Stepper current={stepIdx} />

      <div className="mt-8">
        {step === "city" && (
          <CityStep city={city} setCity={setCity} effectiveSlug={effectiveSlug} />
        )}
        {step === "teams" && (
          <TeamsStep
            enabled={enabled}
            setEnabled={setEnabled}
            labels={labels}
            setLabels={setLabels}
          />
        )}
        {step === "routing" && (
          <RoutingStep
            routing={routing}
            setRouting={setRouting}
            enabledKeys={enabledKeys}
            labels={labels}
          />
        )}
        {step === "roster" && (
          <RosterStep
            granularity={granularity}
            setGranularity={setGranularity}
            delivery={delivery}
            setDelivery={setDelivery}
            roster={roster}
            setRoster={setRoster}
            sharedEmails={sharedEmails}
            setSharedEmails={setSharedEmails}
            enabledKeys={enabledKeys}
            labels={labels}
          />
        )}
        {step === "review" && (
          <ReviewStep
            city={city}
            effectiveSlug={effectiveSlug}
            enabledKeys={enabledKeys}
            labels={labels}
            granularity={granularity}
            delivery={delivery}
            roster={roster}
            sharedEmails={sharedEmails}
            adminEmail={adminEmail}
          />
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={stepIdx === 0 || busy}
        >
          Back
        </Button>
        {step === "review" ? (
          <Button
            variant="accent"
            onClick={submit}
            isPending={busy}
            disabled={busy}
          >
            Create city
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={goNext}
            isPending={busy}
            disabled={busy}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Stepper */

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                active
                  ? "bg-[#0a84ff] text-white"
                  : done
                    ? "bg-foreground text-background"
                    : "bg-surface text-faint border border-hairline"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                active ? "text-foreground" : "text-faint"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------- primitives */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: control is nested inside via `children` (not statically visible to biome)
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-subtle">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground outline-none transition-shadow placeholder:text-faint focus:ring-2 focus:ring-[#0a84ff]/50";

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-subtle">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------- city step */

function CityStep({
  city,
  setCity,
  effectiveSlug,
}: {
  city: CityState;
  setCity: React.Dispatch<React.SetStateAction<CityState>>;
  effectiveSlug: string;
}) {
  return (
    <div>
      <StepHeading
        title="Your city"
        sub="Where do you serve? We'll center your map here."
      />
      <div className="space-y-4">
        <Field label="City name">
          <input
            className={inputCls}
            value={city.name}
            placeholder="Cumming"
            onChange={(e) =>
              setCity((c) => ({ ...c, name: e.target.value, center: null }))
            }
          />
        </Field>
        <Field label="State">
          <input
            className={inputCls}
            value={city.state}
            placeholder="Georgia"
            onChange={(e) =>
              setCity((c) => ({ ...c, state: e.target.value, center: null }))
            }
          />
        </Field>
        <Field
          label="Public address"
          hint="The URL where residents and staff reach your city."
        >
          <div className="flex items-center rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
            <span className="text-faint">/city/</span>
            <input
              className="flex-1 bg-transparent text-foreground outline-none"
              value={city.slug}
              placeholder={slugify(city.name) || "your-city"}
              onChange={(e) =>
                setCity((c) => ({ ...c, slug: e.target.value }))
              }
            />
          </div>
        </Field>
        <p className="text-xs text-subtle">
          Your city will live at{" "}
          <span className="font-medium text-foreground">
            /city/{effectiveSlug}
          </span>
          .
          {city.geoDisplay && (
            <>
              {" "}
              Located:{" "}
              <span className="text-foreground">{city.geoDisplay}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ teams step */

function TeamsStep({
  enabled,
  setEnabled,
  labels,
  setLabels,
}: {
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  labels: Record<string, string>;
  setLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div>
      <StepHeading
        title="Your teams"
        sub="Turn on the divisions your city runs. Rename any to match your org."
      />
      <ul className="space-y-2">
        {TEAM_PRESETS.map((t) => {
          const on = enabled[t.id];
          return (
            <li
              key={t.id}
              className="rounded-lg border border-hairline bg-surface p-3"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Toggle ${t.label}`}
                  onClick={() =>
                    setEnabled((e) => ({ ...e, [t.id]: !e[t.id] }))
                  }
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                    on ? "bg-[#0a84ff]" : "bg-overlay-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-[18px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
                {on ? (
                  <input
                    className="flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-[#0a84ff]/50"
                    value={labels[t.id] ?? t.label}
                    onChange={(e) =>
                      setLabels((l) => ({ ...l, [t.id]: e.target.value }))
                    }
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium text-faint line-through">
                    {t.label}
                  </span>
                )}
              </div>
              {on && (
                <p className="mt-2 pl-13 text-xs text-subtle">{t.duties}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- routing step */

function RoutingStep({
  routing,
  setRouting,
  enabledKeys,
  labels,
}: {
  routing: RoutingMap;
  setRouting: React.Dispatch<React.SetStateAction<RoutingMap>>;
  enabledKeys: string[];
  labels: Record<string, string>;
}) {
  return (
    <div>
      <StepHeading
        title="Auto-routing"
        sub="When a report comes in, which team owns it? Defaults are set — adjust any."
      />
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
        {ALL_CATEGORIES.map((cat) => (
          <li
            key={cat}
            className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5"
          >
            <span className="text-sm text-foreground">{categoryLabel(cat)}</span>
            <select
              className="rounded-md border border-hairline bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#0a84ff]/50"
              value={routing[cat] ?? ""}
              onChange={(e) =>
                setRouting((r) => ({ ...r, [cat]: e.target.value }))
              }
            >
              {enabledKeys.map((k) => (
                <option key={k} value={k}>
                  {labels[k] ?? k}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------- roster step */

function RosterStep({
  granularity,
  setGranularity,
  delivery,
  setDelivery,
  roster,
  setRoster,
  sharedEmails,
  setSharedEmails,
  enabledKeys,
  labels,
}: {
  granularity: RosterGranularity;
  setGranularity: (g: RosterGranularity) => void;
  delivery: CredentialDelivery;
  setDelivery: (d: CredentialDelivery) => void;
  roster: RosterPersonInput[];
  setRoster: React.Dispatch<React.SetStateAction<RosterPersonInput[]>>;
  sharedEmails: Record<string, string>;
  setSharedEmails: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  enabledKeys: string[];
  labels: Record<string, string>;
}) {
  return (
    <div>
      <StepHeading
        title="Staff & logins"
        sub="We generate accounts for your team. Choose how logins are structured."
      />

      {/* granularity */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ModeCard
          active={granularity === "per_person"}
          title="One login per person"
          desc="Individual accounts. Full audit trail of who did what."
          onClick={() => setGranularity("per_person")}
        />
        <ModeCard
          active={granularity === "shared_per_team"}
          title="One shared login per team"
          desc="One account per team, shared by the crew. Fewer accounts."
          onClick={() => setGranularity("shared_per_team")}
        />
      </div>

      {granularity === "shared_per_team" && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Shared logins can't tell who did what — actions attribute to the team,
          not a person, and the password is harder to rotate.
        </p>
      )}

      {/* delivery */}
      <div className="mt-6">
        <p className="text-sm font-medium text-foreground">Credential delivery</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ChoiceChip
            active={delivery === "temp_password"}
            onClick={() => setDelivery("temp_password")}
            label="Temp password + CSV"
          />
          <ChoiceChip
            active={delivery === "invite"}
            onClick={() => setDelivery("invite")}
            label="Email invite"
          />
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          {delivery === "temp_password"
            ? "We generate a temporary password for each account, shown once and downloadable as CSV."
            : "Each person gets an email link to set their own password (requires email configured)."}
        </p>
      </div>

      {/* accounts */}
      <div className="mt-6">
        {granularity === "per_person" ? (
          <PerPersonRoster
            roster={roster}
            setRoster={setRoster}
            enabledKeys={enabledKeys}
            labels={labels}
          />
        ) : (
          <SharedRoster
            sharedEmails={sharedEmails}
            setSharedEmails={setSharedEmails}
            enabledKeys={enabledKeys}
            labels={labels}
          />
        )}
      </div>
    </div>
  );
}

function PerPersonRoster({
  roster,
  setRoster,
  enabledKeys,
  labels,
}: {
  roster: RosterPersonInput[];
  setRoster: React.Dispatch<React.SetStateAction<RosterPersonInput[]>>;
  enabledKeys: string[];
  labels: Record<string, string>;
}) {
  const update = (i: number, patch: Partial<RosterPersonInput>) =>
    setRoster((r) => r.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-2">
      {roster.length === 0 && (
        <p className="text-sm text-subtle">
          No staff yet — add people, or skip and invite them later.
        </p>
      )}
      {roster.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder-free
        <div key={i} className="rounded-lg border border-hairline bg-surface p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="Full name"
              value={p.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="email@city.gov"
              value={p.email}
              onChange={(e) => update(i, { email: e.target.value })}
            />
            <select
              className={inputCls}
              value={p.role}
              onChange={(e) => update(i, { role: e.target.value as StaffRole })}
            >
              {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={p.teamKey}
              onChange={(e) => update(i, { teamKey: e.target.value })}
            >
              {enabledKeys.map((k) => (
                <option key={k} value={k}>
                  {labels[k] ?? k}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setRoster((r) => r.filter((_, idx) => idx !== i))}
              className="inline-flex items-center gap-1 text-xs text-faint hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setRoster((r) => [...r, emptyPerson(enabledKeys[0] ?? "")])
        }
      >
        <Plus className="h-4 w-4" /> Add staff member
      </Button>
    </div>
  );
}

function SharedRoster({
  sharedEmails,
  setSharedEmails,
  enabledKeys,
  labels,
}: {
  sharedEmails: Record<string, string>;
  setSharedEmails: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  enabledKeys: string[];
  labels: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-subtle">
        One supervisor login per team. Leave a team blank to skip it.
      </p>
      {enabledKeys.map((k) => (
        <div
          key={k}
          className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-2.5 sm:flex-row sm:items-center"
        >
          <span className="w-full text-sm font-medium text-foreground sm:w-48">
            {labels[k] ?? k}
          </span>
          <input
            className={inputCls}
            placeholder={`${k}@city.gov`}
            value={sharedEmails[k] ?? ""}
            onChange={(e) =>
              setSharedEmails((s) => ({ ...s, [k]: e.target.value }))
            }
          />
        </div>
      ))}
    </div>
  );
}

function ModeCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-[#0a84ff] bg-[#0a84ff]/5"
          : "border-hairline bg-surface hover:border-overlay-strong"
      }`}
    >
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="mt-0.5 block text-xs text-subtle">{desc}</span>
    </button>
  );
}

function ChoiceChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-[#0a84ff] bg-[#0a84ff] text-white"
          : "border-hairline bg-surface text-foreground hover:border-overlay-strong"
      }`}
    >
      {label}
    </button>
  );
}

/* ----------------------------------------------------------- review step */

function ReviewStep({
  city,
  effectiveSlug,
  enabledKeys,
  labels,
  granularity,
  delivery,
  roster,
  sharedEmails,
  adminEmail,
}: {
  city: CityState;
  effectiveSlug: string;
  enabledKeys: string[];
  labels: Record<string, string>;
  granularity: RosterGranularity;
  delivery: CredentialDelivery;
  roster: RosterPersonInput[];
  sharedEmails: Record<string, string>;
  adminEmail: string | null;
}) {
  const accountCount =
    granularity === "per_person"
      ? roster.filter((p) => p.email.trim()).length
      : enabledKeys.filter((k) => (sharedEmails[k] ?? "").trim()).length;

  return (
    <div>
      <StepHeading
        title="Review & create"
        sub="Confirm the setup. You can change everything later from your console."
      />
      <dl className="space-y-3 text-sm">
        <Row label="City">
          {city.name || "—"}, {city.state || "—"}{" "}
          <span className="text-faint">(/city/{effectiveSlug})</span>
        </Row>
        <Row label="Admin">{adminEmail ?? "you"}</Row>
        <Row label="Teams">
          {enabledKeys.length} —{" "}
          {enabledKeys.map((k) => labels[k] ?? k).join(", ") || "none"}
        </Row>
        <Row label="Logins">
          {accountCount}{" "}
          {granularity === "per_person" ? "individual" : "shared-team"} account
          {accountCount === 1 ? "" : "s"} via{" "}
          {delivery === "invite" ? "email invite" : "temp password"}
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-hairline pb-3">
      <dt className="w-20 shrink-0 text-faint">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

/* --------------------------------------------------------- result screen */

function buildCsv(result: ProvisionResult): string {
  const header = "email,name,team,role,status,temp_password";
  const rows = result.accounts.map((a) =>
    [
      a.email,
      a.label,
      a.teamKey ?? "",
      a.role,
      a.status,
      a.tempPassword ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function ResultScreen({
  result,
  delivery,
}: {
  result: ProvisionResult;
  delivery: CredentialDelivery;
}) {
  const created = result.accounts.filter(
    (a) => a.status === "created" || a.status === "invited",
  ).length;
  const failed = result.accounts.filter((a) => a.status === "error").length;
  const skipped = result.accounts.filter((a) => a.status === "skipped").length;
  const hasTempPasswords = result.accounts.some((a) => a.tempPassword);

  const downloadCsv = () => {
    const blob = new Blob([buildCsv(result)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.citySlug ?? "city"}-credentials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0a84ff]/10">
        <Check className="h-6 w-6 text-[#0a84ff]" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        Your city is live
      </h1>
      <p className="mt-1.5 text-sm text-subtle">
        {created} account{created === 1 ? "" : "s"}{" "}
        {delivery === "invite" ? "invited" : "created"}
        {skipped > 0 && `, ${skipped} skipped`}
        {failed > 0 && `, ${failed} failed`}.
      </p>

      {result.warnings && result.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {result.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {hasTempPasswords && (
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Save these credentials now — temporary passwords are shown once.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={downloadCsv}>
            <Download className="h-4 w-4" /> Download CSV
          </Button>
        </div>
      )}

      {result.accounts.length > 0 && (
        <ul className="mt-5 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          {result.accounts.map((a, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: terminal list, never reordered; emails repeat so aren't unique
              key={`${a.email}-${i}`}
              className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-foreground">{a.label}</p>
                <p className="truncate text-xs text-faint">{a.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {a.tempPassword && (
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs text-foreground">
                    {a.tempPassword}
                  </code>
                )}
                <StatusBadge status={a.status} message={a.message} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 flex gap-3">
        <Button asChild variant="accent">
          <Link href={`/city/${result.citySlug}`}>Go to your console</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/staff">Staff inbox</Link>
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  message,
}: {
  status: string;
  message?: string;
}) {
  const tone =
    status === "error"
      ? "text-red-600 dark:text-red-400"
      : status === "skipped"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`shrink-0 text-xs font-medium ${tone}`} title={message}>
      {status}
    </span>
  );
}
