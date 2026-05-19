
CREATE TABLE public.coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_notes_client ON public.coach_notes(client_id, created_at DESC);

ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches view all notes" ON public.coach_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR auth.uid() = client_id);

CREATE POLICY "Coaches insert notes" ON public.coach_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach') AND auth.uid() = coach_id);

-- Demo helper: allow users to grant themselves coach role
CREATE POLICY "Users self-grant coach (demo)" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
