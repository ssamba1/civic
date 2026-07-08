"use client";

import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/app/admin/api-keys/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  API_KEY_SCOPES,
  type ApiKeyRow,
  type ApiKeyScope,
} from "@/lib/open311/api-key-types";

interface CityOption {
  id: string;
  label: string;
}

interface Props {
  keys: ApiKeyRow[];
  cities: CityOption[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApiKeysManager({ keys, cities }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["open311:write"]);
  // The one-time plaintext reveal — held in memory only, cleared on dismiss.
  const [minted, setMinted] = useState<{
    label: string;
    plaintext: string;
  } | null>(null);

  const cityLabel = (id: string | null) =>
    id
      ? (cities.find((c) => c.id === id)?.label ?? "Unknown city")
      : "All cities";

  function toggleScope(s: ApiKeyScope) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function onMint() {
    if (!label.trim()) {
      toast("Give the key a label first.", "error");
      return;
    }
    if (scopes.length === 0) {
      toast("Pick at least one scope.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createApiKeyAction({
        label: label.trim(),
        cityId: cityId || null,
        userId: null, // default attribution: the issuing admin
        scopes,
      });
      if (!res.ok) {
        toast(`Could not issue key: ${res.error}`, "error");
        return;
      }
      setMinted({ label: label.trim(), plaintext: res.data.plaintext });
      setLabel("");
      setCityId("");
      setScopes(["open311:write"]);
      toast("API key issued.", "success");
    });
  }

  function onRevoke(id: string, keyLabel: string) {
    if (
      !window.confirm(
        `Revoke "${keyLabel}"? Any integration using it will stop working immediately.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await revokeApiKeyAction(id);
      if (!res.ok) {
        toast(`Could not revoke: ${res.error}`, "error");
        return;
      }
      toast("Key revoked.", "success");
    });
  }

  async function copyPlaintext() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.plaintext);
      toast("Copied to clipboard.", "success");
    } catch {
      toast("Copy failed — select and copy manually.", "error");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* One-time plaintext reveal */}
      {minted && (
        <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.06] p-5">
          <div className="flex items-start gap-3">
            <KeyRound
              className="mt-0.5 size-5 shrink-0 text-[var(--color-primary)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                Key issued for “{minted.label}”
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                Copy it now — this is the only time it will be shown.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-[13px] text-foreground">
                  {minted.plaintext}
                </code>
                <Button variant="outline" size="sm" onClick={copyPlaintext}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMinted(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mint form */}
      <div className="rounded-2xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
          Issue a new key
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted)]">
              Label
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. SeeClickFix integration"
              maxLength={80}
              className="h-10 rounded-md border border-hairline-strong bg-surface px-3 text-sm text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted)]">
              City scope (optional)
            </span>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="h-10 rounded-md border border-hairline-strong bg-surface px-3 text-sm text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-[var(--color-muted)]">
            Scopes
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {API_KEY_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggleScope(s)}
                  className="size-4 rounded border-hairline-strong"
                />
                <code className="font-mono text-[13px]">{s}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5">
          <Button
            variant="accent"
            onClick={onMint}
            disabled={pending}
            data-loading={pending}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            Issue key
          </Button>
        </div>
      </div>

      {/* Key list */}
      {keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          No API keys yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <th scope="col" className="px-4 py-3 font-medium">
                  Label
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  City
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Scopes
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Issued
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const revoked = k.revokedAt !== null;
                return (
                  <tr
                    key={k.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-medium text-[var(--color-foreground)]"
                    >
                      {k.label}
                    </th>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {cityLabel(k.cityId)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[var(--color-muted)]">
                        {k.scopes.join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {fmtDate(k.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {revoked ? (
                        <span className="text-xs font-medium text-[var(--color-danger)]">
                          ● Revoked
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-[var(--color-success)]">
                          ● Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRevoke(k.id, k.label)}
                          disabled={pending}
                          aria-label={`Revoke ${k.label}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
