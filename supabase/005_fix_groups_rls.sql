-- =============================================================================
-- Fix: "new row violates row-level security policy for table groups"
--
-- Cause: INSERT ... RETURNING needs a SELECT policy too. After insert, the
-- creator is not yet in group_members, so is_group_member(id) fails.
-- =============================================================================

-- Groups: creator can always see their own trips (even before group_members row)
DROP POLICY IF EXISTS groups_select_creator ON public.groups;
CREATE POLICY groups_select_creator ON public.groups
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Groups: authenticated users can create trips they own
DROP POLICY IF EXISTS groups_insert ON public.groups;
DROP POLICY IF EXISTS groups_insert_authenticated ON public.groups;
CREATE POLICY groups_insert ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- Groups: members can read trips they belong to
DROP POLICY IF EXISTS groups_select_member ON public.groups;
DROP POLICY IF EXISTS groups_select ON public.groups;
CREATE POLICY groups_select_member ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_group_member(id));

-- Groups: update/delete (keep if missing)
DROP POLICY IF EXISTS groups_update_member ON public.groups;
DROP POLICY IF EXISTS groups_update ON public.groups;
CREATE POLICY groups_update_member ON public.groups
  FOR UPDATE TO authenticated
  USING (public.is_group_member(id))
  WITH CHECK (public.is_group_member(id));

DROP POLICY IF EXISTS groups_delete_creator ON public.groups;
DROP POLICY IF EXISTS groups_delete ON public.groups;
CREATE POLICY groups_delete_creator ON public.groups
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- group_members: creator row on new trip (insert group + creator member in one flow)
DROP POLICY IF EXISTS group_members_insert_creator ON public.group_members;
CREATE POLICY group_members_insert_creator ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND is_creator = true
    AND is_guest = false
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.creator_id = auth.uid()
    )
  );

-- group_members: guest rows added by existing members
DROP POLICY IF EXISTS group_members_insert_guest ON public.group_members;
CREATE POLICY group_members_insert_guest ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_guest = true
    AND profile_id IS NULL
    AND public.is_group_member(group_id)
  );

-- group_members: join existing trip
DROP POLICY IF EXISTS group_members_insert_join ON public.group_members;
DROP POLICY IF EXISTS gm_insert_join ON public.group_members;
CREATE POLICY group_members_insert_join ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND is_guest = false
    AND is_creator = false
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id)
  );

DROP POLICY IF EXISTS group_members_select_member ON public.group_members;
DROP POLICY IF EXISTS gm_select ON public.group_members;
CREATE POLICY group_members_select_member ON public.group_members
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));
