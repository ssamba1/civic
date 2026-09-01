import { ApiKeysManager } from "@/components/admin/api-keys-manager";
import { listCities } from "@/lib/onboarding/cities";
import { listApiKeys } from "@/lib/open311/admin-keys";

export const dynamic = "force-dynamic";

export default async function AdminApiKeysPage() {
  const [keys, cities] = await Promise.all([listApiKeys(), listCities()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Open311 API keys
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Per-partner keys for the Open311 GeoReport v2 API. Each key carries
          its own attribution and optional city scope, and can be revoked
          independently. The plaintext is shown once, at issuance, store it
          securely.
        </p>
      </div>

      <ApiKeysManager
        keys={keys}
        cities={cities.map((c) => ({
          id: c.id,
          label: `${c.name}, ${c.state}`,
        }))}
      />
    </div>
  );
}
