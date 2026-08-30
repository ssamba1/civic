import { WebhookForm } from "@/components/admin/webhook-form";
import { WebhooksTable } from "@/components/admin/webhooks-table";
import { listCities } from "@/lib/onboarding/cities";
import { listWebhooksAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminWebhooksPage() {
  const [cities, webhooksResult] = await Promise.all([
    listCities(),
    listWebhooksAction(),
  ]);

  const webhooks = webhooksResult.ok ? webhooksResult.data : [];
  const cityOptions = cities.map((c) => ({
    id: c.id,
    label: `${c.name}, ${c.state}`,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Outbound webhooks
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Register HTTPS endpoints to receive real-time events (Zapier, Make,
          custom). Each delivery includes an{" "}
          <code className="text-xs">X-Civic-Signature</code> HMAC-SHA256 header
          for verification. Secrets are shown once at registration.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
            Register endpoint
          </h2>
          <WebhookForm />
        </section>

        <section>
          <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
            Registered endpoints ({webhooks.length})
          </h2>
          <WebhooksTable endpoints={webhooks} />
        </section>
      </div>
    </div>
  );
}
