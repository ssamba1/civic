-- Retention settings per city. Admins can customise how long raw photos and
-- free-text descriptions are kept before deletion.
create table if not exists retention_settings (
  id               uuid primary key default gen_random_uuid(),
  city_id          uuid references cities(id) on delete cascade,
  raw_photo_ttl_days  int not null default 30,
  freetext_ttl_days   int not null default 365,
  updated_at       timestamptz not null default now(),
  unique(city_id)
);

alter table retention_settings enable row level security;

-- Admin read (matches pattern in migration 017)
create policy "admin_read" on retention_settings
  for select
  using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

-- Admin write
create policy "admin_write" on retention_settings
  for all
  using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );
