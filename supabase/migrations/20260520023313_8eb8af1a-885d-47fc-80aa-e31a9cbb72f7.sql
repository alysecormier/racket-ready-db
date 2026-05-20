-- Lesson type presets + match play opt-in
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_type text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stay_for_match_play boolean NOT NULL DEFAULT false;

-- The existing guard_bookings_payment_fields trigger explicitly lists the
-- fields it blocks; stay_for_match_play is NOT in that list, so users can
-- update it on their own bookings via the standard RLS policy.

-- Helpful index for the match-play roster lookup
CREATE INDEX IF NOT EXISTS bookings_lesson_matchplay_idx
  ON public.bookings (lesson_id)
  WHERE stay_for_match_play = true;