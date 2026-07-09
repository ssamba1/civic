import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { REQUEST_KINDS, type RequestRow } from "@/lib/requests/types";

export const dynamic = "force-dynamic";

const logger = createLogger("[admin-requests]");

const KIND_LABEL = Object.fromEntries(
  REQUEST_KINDS.map((k) => [k.value, k.label]),
);

const STATUS_VARIANT: Record<RequestRow["status"], "default" | "success"> = {
  new: "success",
  triaged: "default",
  done: "default",
  declined: "default",
};

async function listRequests(): Promise<RequestRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .select(
      "id, kind, title, body, email, city_name, source, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    logger.error("List failed", error);
    return [];
  }
  return (data ?? []) as RequestRow[];
}

export default async function AdminRequestsPage() {
  const requests = await listRequests();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Requests
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Inbound feature, quality-of-life, and setup-help requests from cities
          and users.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-border)] p-12 text-center">
          <Inbox
            className="mx-auto size-8 text-[var(--color-muted)]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            No requests yet.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  <span className="text-xs font-medium text-[var(--color-muted)]">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                </div>
                <time
                  className="text-xs text-[var(--color-muted)]"
                  dateTime={r.created_at}
                >
                  {new Date(r.created_at).toLocaleString()}
                </time>
              </div>
              <h2 className="mt-2 text-base font-semibold text-[var(--color-foreground)]">
                {r.title}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-muted)]">
                {r.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                {r.city_name ? <span>City: {r.city_name}</span> : null}
                {r.email ? (
                  <a
                    href={`mailto:${r.email}`}
                    className="text-[var(--color-primary)] underline"
                  >
                    {r.email}
                  </a>
                ) : null}
                {r.source ? <span>via {r.source}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
