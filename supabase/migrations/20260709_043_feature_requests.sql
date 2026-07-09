-- 043 feature / help requests — inbound channel for cities and users to ask for
-- features, QoL improvements, or hands-on help setting up their city. Distinct
-- from /onboard (self-serve tenant provisioning): this is a lightweight "talk to
-- us" inbox surfaced in /admin/requests. Writes go through a server action using
-- the service-role client, so — like council_districts (041) — RLS is
-- default-deny with NO policies: anon/authenticated cannot read or write
-- directly, service_role bypasses. (agents.md rule 3.)

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- what the requester wants: a new feature, a quality-of-life tweak, help
  -- standing up their city, or something else.
  kind text NOT NULL DEFAULT 'feature'
    CHECK (kind IN ('feature', 'qol', 'setup', 'help', 'other')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- optional contact + context. email lets us reply; city_name scopes the ask.
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  city_name text CHECK (city_name IS NULL OR char_length(city_name) <= 160),
  -- where the request originated (route path) for triage context.
  source text CHECK (source IS NULL OR char_length(source) <= 120),
  -- set when a signed-in user submits; NULL for anonymous public submissions.
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'done', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status_created
  ON public.feature_requests (status, created_at DESC);

-- RLS: default-deny, no policies. All access via service-role server action.
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
