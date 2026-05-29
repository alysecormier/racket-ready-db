
-- Remove existing duplicate Active bookings (keep earliest by created_at)
DELETE FROM public.lesson_bookings a
USING public.lesson_bookings b
WHERE a.id <> b.id
  AND a.participant_id = b.participant_id
  AND a.lesson_id = b.lesson_id
  AND a.cancellation_status = 'Active'
  AND b.cancellation_status = 'Active'
  AND a.created_at > b.created_at;

-- Unique partial index to prevent future duplicates of active bookings
CREATE UNIQUE INDEX IF NOT EXISTS lesson_bookings_unique_active
  ON public.lesson_bookings (participant_id, lesson_id)
  WHERE cancellation_status = 'Active';
