"use client";

import { useEffect, useId, useState } from "react";
import type { SsoConfigRow } from "./actions";
import {
  deleteSsoConfigAction,
  listSsoConfigsAction,
  saveSsoConfigAction,
} from "./actions";

export default function AdminSsoPage() {
  const formId = useId();
  const [configs, setConfigs] = useState<SsoConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [x509cert, setX509cert] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listSsoConfigsAction().then((r) => {
      if (r.ok) setConfigs(r.data);
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await saveSsoConfigAction({
      entityId,
      ssoUrl,
      x509cert,
      domain,
      cityId: null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
    } else {
      setSaved(true);
      const refreshed = await listSsoConfigsAction();
      if (refreshed.ok) setConfigs(refreshed.data);
      setEntityId("");
      setSsoUrl("");
      setX509cert("");
      setDomain("");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this SSO configuration?")) return;
    await deleteSsoConfigAction(id);
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          SSO / SAML configuration
        </h1>
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Scaffold only.</strong> SAML assertion validation is not yet
          implemented. Storing a config here will not enable SSO logins until
          the callback route is completed. See{" "}
          <code className="text-xs">src/lib/auth/sso.ts</code> for the TODO
          checklist.
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
            Add / update IdP
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                {error}
              </p>
            )}
            {saved && (
              <p className="rounded bg-green-50 p-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
                Configuration saved.
              </p>
            )}

            <div>
              <label
                htmlFor={`${formId}-domain`}
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email domain
              </label>
              <input
                id={`${formId}-domain`}
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor={`${formId}-entity`}
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                IdP Entity ID
              </label>
              <input
                id={`${formId}-entity`}
                required
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="https://idp.example.com/saml"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor={`${formId}-url`}
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                SSO URL
              </label>
              <input
                id={`${formId}-url`}
                required
                type="url"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
                placeholder="https://idp.example.com/sso/saml"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor={`${formId}-cert`}
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                x509 Certificate (PEM)
              </label>
              <textarea
                id={`${formId}-cert`}
                required
                rows={6}
                value={x509cert}
                onChange={(e) => setX509cert(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save configuration"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
            Configured IdPs ({configs.length})
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : configs.length === 0 ? (
            <p className="text-sm text-zinc-500">No SSO configs yet.</p>
          ) : (
            <div className="space-y-3">
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        @{cfg.email_domain}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 break-all">
                        {cfg.entity_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          cfg.active
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                        }`}
                      >
                        {cfg.active ? "active" : "inactive"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(cfg.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
