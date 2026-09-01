-- 038 classification feedback loop (OUTFLANK #7, human-in-the-loop correction)
-- Storage already exists: staff category overrides write classification_feedback
-- (migration 005, writer in staff/actions.ts). This closes the loop. An
-- aggregate the classify pipeline reads to inject the city's most common
-- correction pairs as few-shot guidance into the next classification prompt.
-- A per-city compounding moat: the model gets better at each city's quirks the
-- more its staff correct it.
--
-- Returns the top distinct (original -> corrected) category pairs where staff
-- actually changed the AI's answer, ranked by frequency then recency.
CREATE OR REPLACE FUNCTION public.classification_correction_examples(
  _city_id uuid,
  _limit int DEFAULT 5
)
RETURNS TABLE(original_category text, corrected_category text, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    cf.original_category::text,
    cf.corrected_category::text,
    COUNT(*) AS n
  FROM classification_feedback cf
  JOIN reports r ON r.id = cf.report_id
  WHERE r.city_id = _city_id
    AND cf.original_category <> cf.corrected_category
  GROUP BY cf.original_category, cf.corrected_category
  ORDER BY n DESC, MAX(cf.created_at) DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.classification_correction_examples(uuid, int)
  TO anon, authenticated, service_role;
