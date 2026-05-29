# Data Persistence + Saved Participants + Real-Time Admin

This is a large multi-part change. I'll ship it in 4 focused phases so each one is verifiable before the next.

## Phase 1 — Database schema (Supabase migration)

New tables (with GRANTs + RLS):

- **accounts** — mirrors auth user; `id` defaults to `auth.uid()`; `account_status`, `deposit_status`.
- **participants** — `account_id` FK → accounts, `participant_type` ('adult'|'junior'), `is_account_holder`, `is_saved` (boolean default true, for soft-delete), `age`, `gender`.
- **lesson_bookings** — `account_id`, `participant_id`, `lesson_id` (text), `lesson_name`, `lesson_date`, `lesson_start_time`, `lesson_end_time`, `lesson_price`, `deposit_amount`, `deposit_status`, `payment_method`, `payment_reported_at`, `cancellation_status`, `cancellation_requested_at`, `policy_acknowledged`, `policy_acknowledged_at`.
- **email_log** — `account_id`, `participant_id?`, `lesson_booking_id?`, `email_type`, `sent_to`, `subject`, `status`.

RLS:
- Clients: read/write only rows where `account_id = auth.uid()`.
- Coaches (`has_role(auth.uid(),'coach')`): full read/write all rows.

Enable `supabase_realtime` publication on `lesson_bookings` and `accounts`.

Note: existing `profiles`, `students`, `bookings` tables stay untouched — the new flow uses the new tables so we don't break anything already wired.

## Phase 2 — Write path (onboarding)

In `src/routes/onboarding.tsx`:

- Step 1 complete → upsert `accounts` row + `participants` row (`is_account_holder=true`).
- Step 2 Continue → insert participants for each added adult/child, store returned IDs on the in-memory registrations.
- "I've Paid" click → insert `lesson_bookings` rows for every selected lesson per participant with `deposit_status='Pending'`, payment method, `payment_reported_at=now()`, `policy_acknowledged=true`.
- On page load for logged-in client: fetch saved participants where `account_id=auth.uid() AND is_saved=true` and pre-populate.

## Phase 3 — Saved Participants UI + Client Dashboard

In Step 2:
- New "Saved Participants" section between account-holder card and Add buttons.
- Cards with emoji by gender (👦/👧/🧒/👤), "+ Register for a Lesson" expands a lesson selector inline, "Edit" updates the participant row, "Remove" soft-deletes (`is_saved=false`).

New client home (post-login, in `src/routes/index.tsx` or a new `/dashboard` route):
- "Your Upcoming Lessons" cards from `lesson_bookings` where `lesson_date >= today AND cancellation_status='Active'`.
- Per-card "Add to Cal" (.ics) and "Cancel Lesson" (24h check, updates row + flips `account_status='Deposit Required'` on late cancel).

## Phase 4 — Admin dashboard live data + Realtime

In `src/routes/admin.tsx`:

- Lessons view: query `lesson_bookings` join `participants` + `accounts`, sorted `created_at desc`.
- Columns: account holder, participant, type, lesson name, date/time, price, deposit status, cancellation status, payment method, registered at.
- Search bar (name / date) + filter dropdowns (deposit status, cancellation status, lesson date).
- Action Required: counts from `lesson_bookings.deposit_status='Pending'` and `accounts.account_status='Deposit Required'`.
- Confirm Deposit → update row + log email (email send wiring stays a follow-up; row write happens now).
- Mark as No-Show → update booking (`cancellation_status='No-Show'`, `deposit_status='Forfeited'`) + flip account `account_status='Deposit Required'`.
- Auto-refresh every 60s + manual Refresh button.
- Supabase Realtime subscription on `lesson_bookings` and `accounts` → invalidate queries + toast `🎾 New registration — {name} {lesson} · {date}`.

## What I will NOT touch

- Existing lesson card / calendar / week view visuals
- Green color scheme & Tailwind
- Active-week admin control (already shipped)
- Stripe / Twilio (none added)
- Resend email send wiring (deferred — `email_log` rows are written but the actual send is a separate follow-up; let me know if you want it in this pass)

## Technical details

- Account row uses `id = auth.uid()` so no extra mapping table.
- Writes go through `supabase` client directly under RLS; no server fns needed for the basic CRUD (keeps it simple and live).
- Realtime: `supabase.channel('admin').on('postgres_changes', ...)` subscribed inside admin component, cleaned up on unmount.
- `useQuery` + `refetchInterval: 60_000` for the 60s auto-refresh; invalidation triggered on realtime events.

## Deliverable order

1. Run migration (Phase 1) — needs your approval.
2. After migration approved: write code for Phases 2–4 in one pass.
3. You verify by registering as a test client + viewing admin.

Confirm and I'll send the migration.
