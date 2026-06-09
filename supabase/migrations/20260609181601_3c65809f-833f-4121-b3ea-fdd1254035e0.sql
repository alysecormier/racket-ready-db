ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS is_waitlisted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lesson_bookings_lesson_active_idx
  ON public.lesson_bookings (lesson_id)
  WHERE cancellation_status = 'Active' AND is_waitlisted = false;

UPDATE public.lesson_bookings
  SET deposit_status = 'Confirmed'
  WHERE deposit_status = 'Pending'
    AND cancellation_status = 'Active'
    AND is_waitlisted = false;