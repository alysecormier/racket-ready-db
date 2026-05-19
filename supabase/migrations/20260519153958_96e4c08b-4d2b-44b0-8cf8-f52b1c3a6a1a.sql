
ALTER TABLE public.profiles
  ADD COLUMN waiver_signed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN waiver_signature TEXT,
  ADD COLUMN waiver_signed_at TIMESTAMPTZ;
