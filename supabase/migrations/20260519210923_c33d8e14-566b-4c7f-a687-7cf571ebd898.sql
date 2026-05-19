
-- Remove the privilege-escalation policy: anyone could insert their own coach role.
DROP POLICY IF EXISTS "Users self-grant coach (demo)" ON public.user_roles;

-- Only existing coaches may grant/revoke roles. The bootstrap coach
-- (alysemcormier@gmail.com) is seeded by the handle_new_user trigger.
CREATE POLICY "Coaches manage user_roles insert"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches manage user_roles delete"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches manage user_roles update"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'coach'));
