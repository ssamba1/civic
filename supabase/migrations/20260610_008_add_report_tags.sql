alter table public.reports add column if not exists tags text[] not null default '{}';
