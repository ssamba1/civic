-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_056_routing_decisions.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

create table if not exists public.routing_decisions (
  id uuid default gen_random_uuid() not null,
  city_id uuid not null,
  work_order_id uuid,
  report_id uuid,
  chosen_unit_id uuid,
  source text default 'scorer'::text not null,
  mode text default 'shadow'::text not null,
  term_breakdown jsonb default '{}'::jsonb not null,
  alternatives jsonb default '[]'::jsonb not null,
  legacy_unit_id uuid,
  decided_at timestamp with time zone default now() not null,
  constraint routing_decisions_chosen_unit_id_fkey FOREIGN KEY (chosen_unit_id) REFERENCES org_units(id) ON DELETE SET NULL,
  constraint routing_decisions_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  constraint routing_decisions_legacy_unit_id_fkey FOREIGN KEY (legacy_unit_id) REFERENCES org_units(id) ON DELETE SET NULL,
  constraint routing_decisions_mode_check CHECK ((mode = ANY (ARRAY['shadow'::text, 'authoritative'::text]))),
  constraint routing_decisions_pkey PRIMARY KEY (id),
  constraint routing_decisions_report_id_fkey FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  constraint routing_decisions_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

alter table public.routing_decisions enable row level security;

CREATE INDEX idx_routing_decisions_city_time ON public.routing_decisions USING btree (city_id, decided_at DESC);

CREATE INDEX idx_routing_decisions_work_order ON public.routing_decisions USING btree (work_order_id);

create policy "routing_decisions_select_staff" on public.routing_decisions for select to public
  using ((is_staff() AND (city_id = current_user_city_id())));

create table if not exists public.routing_events (
  id uuid default gen_random_uuid() not null,
  city_id uuid not null,
  work_order_id uuid,
  kind text not null,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint routing_events_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  constraint routing_events_pkey PRIMARY KEY (id),
  constraint routing_events_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

alter table public.routing_events enable row level security;

CREATE INDEX idx_routing_events_city_kind_time ON public.routing_events USING btree (city_id, kind, created_at DESC);

create policy "routing_events_select_staff" on public.routing_events for select to public
  using ((is_staff() AND (city_id = current_user_city_id())));
