-- =============================================================================
-- DutchIT — Run AFTER schema + RLS (fixes join-by-code before membership)
-- =============================================================================

-- 1) Look up a trip by join_code (for join flow — user is not a member yet)
CREATE OR REPLACE FUNCTION public.lookup_group_by_join_code(p_join_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.groups%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.groups WHERE join_code = p_join_code;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'join_code', v_row.join_code,
    'name', v_row.name,
    'picture', v_row.picture,
    'picture_type', v_row.picture_type,
    'base_currency', v_row.base_currency,
    'intermediate_currency', v_row.intermediate_currency
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_group_by_join_code(TEXT) TO authenticated;

-- 2) Realtime (enable live updates later)
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversion_rates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_settlements;
