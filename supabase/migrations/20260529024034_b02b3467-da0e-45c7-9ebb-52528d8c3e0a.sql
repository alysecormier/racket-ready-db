
-- accounts table (id = auth.uid())
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_name text,
  last_name text,
  email text UNIQUE,
  phone text,
  account_status text NOT NULL DEFAULT 'Active',
  deposit_status text NOT NULL DEFAULT 'Pending'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts owner select" ON public.accounts FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "accounts owner insert" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "accounts owner update" ON public.accounts FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "accounts coach delete" ON public.accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- participants table
CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  participant_type text NOT NULL CHECK (participant_type IN ('adult','junior')),
  is_account_holder boolean NOT NULL DEFAULT false,
  is_saved boolean NOT NULL DEFAULT true,
  age integer,
  gender text
);
CREATE INDEX participants_account_id_idx ON public.participants(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants owner all" ON public.participants FOR ALL TO authenticated
  USING (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'));

-- lesson_bookings table
CREATE TABLE public.lesson_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  lesson_name text NOT NULL,
  lesson_date date NOT NULL,
  lesson_start_time time,
  lesson_end_time time,
  lesson_price numeric NOT NULL DEFAULT 0,
  deposit_amount numeric NOT NULL DEFAULT 0,
  deposit_status text NOT NULL DEFAULT 'Pending',
  payment_method text,
  payment_reported_at timestamptz,
  cancellation_status text NOT NULL DEFAULT 'Active',
  cancellation_requested_at timestamptz,
  policy_acknowledged boolean NOT NULL DEFAULT false,
  policy_acknowledged_at timestamptz
);
CREATE INDEX lesson_bookings_account_id_idx ON public.lesson_bookings(account_id);
CREATE INDEX lesson_bookings_participant_id_idx ON public.lesson_bookings(participant_id);
CREATE INDEX lesson_bookings_lesson_date_idx ON public.lesson_bookings(lesson_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_bookings TO authenticated;
GRANT ALL ON public.lesson_bookings TO service_role;
ALTER TABLE public.lesson_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_bookings owner all" ON public.lesson_bookings FOR ALL TO authenticated
  USING (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'));

-- email_log table
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  lesson_booking_id uuid REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  email_type text NOT NULL,
  sent_to text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'Sent'
);
CREATE INDEX email_log_account_id_idx ON public.email_log(account_id);
GRANT SELECT, INSERT ON public.email_log TO authenticated;
GRANT ALL ON public.email_log TO service_role;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_log owner select" ON public.email_log FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "email_log owner insert" ON public.email_log FOR INSERT TO authenticated
  WITH CHECK (account_id = auth.uid() OR public.has_role(auth.uid(), 'coach'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
ALTER TABLE public.lesson_bookings REPLICA IDENTITY FULL;
ALTER TABLE public.accounts REPLICA IDENTITY FULL;
