## Conflicts with the spec (must resolve first)

**1. Schema is already live with real data — do not recreate.**
Your `lessons`, `bookings`, `students`, `waitlist`, `profiles` tables already exist with the exact semantic fields you listed, but using `uuid` primary keys (not `BIGSERIAL`). They contain real lessons, bookings, and a working onboarding/admin flow that depends on the current types.

Running the proposed `CREATE TABLE` statements would either error (tables exist) or, if I dropped first, destroy every booking, lesson, waiver signature, and saved Stripe customer, and break `onboarding.tsx`, `admin.tsx`, `booking.functions.ts`, `mock-client.functions.ts`, and `types.ts`.

**Recommendation:** keep the existing UUID schema (functionally identical) and only add what's missing. Specifically I'll add:
- `bookings.status` (`active` | `canceled`) — currently called `cancellation_status`; I'll add `status` as the canonical column and keep the old one as a generated alias for back-compat, or migrate code in one pass. (I'll just rename → `status` and update the 3 files that reference it.)
- `bookings.payment_status` already exists; widen the check to `('paid','unpaid','refunded','penalty_charged')`.
- Profiles already has `stripe_customer_id`, `waiver_signed`, `waiver_signed_at` — equivalent to your `signed_waiver`/`signed_at`. No change.

**2. "Supabase Edge Function" → TanStack server route.**
This project's stack guidance forbids Edge Functions for new server-side logic. The Stripe webhook already lives at `src/routes/api/public/payments/webhook.ts` and handles `checkout.session.completed` → inserts a paid booking. I'll extend that file rather than create a parallel Edge Function. Twilio reminders + waitlist will be TanStack server routes under `/api/public/hooks/*`, triggered by `pg_cron`.

**3. Coach access for alysemcormier@gmail.com.**
Roles already live in `user_roles` with a `has_role()` security-definer function, and all RLS already grants coaches full access via `has_role(auth.uid(), 'coach')`. I'll just insert a `coach` role row for that email once her profile exists (and add a one-shot script that promotes her on first login).

## What I'll actually build

### A. Schema additions (single migration)
- Rename `bookings.cancellation_status` → `status`, update check to `('active','canceled')`.
- Widen `bookings.payment_status` check to include `'refunded'` and `'penalty_charged'`.
- Add `bookings.stripe_payment_intent_id text` (needed for refunds / off-session charges).
- Add `bookings.reminder_sent_at timestamptz` (so the 24h cron is idempotent).
- Add `waitlist.offered_at timestamptz` and `waitlist.offer_expires_at timestamptz` (15-min window).
- Add `profiles.default_payment_method_id text` (for off-session cancellation penalty charges).
- Promote `alysemcormier@gmail.com` to coach (no-op if not signed up yet; trigger handles future signup).

### B. Stripe webhook extensions (`src/routes/api/public/payments/webhook.ts`)
- On `checkout.session.completed`: save `payment_intent` id + payment method id onto the booking and profile (for future off-session charges). Already inserts paid booking.
- On `payment_intent.succeeded` with `metadata.kind = 'cancellation_penalty'`: mark booking `payment_status = 'penalty_charged'`.
- On `charge.refunded`: mark booking `payment_status = 'refunded'`.

### C. Cancellation flow (new server fn `src/lib/cancel.functions.ts`)
When a client cancels via the portal:
- If >24h before lesson → full refund via Stripe, set `status='canceled'`, `payment_status='refunded'`, trigger waitlist escalation.
- If <24h → off-session charge of 50% of lesson price using saved payment method, set `status='canceled'`, `payment_status='penalty_charged'` (set via webhook), trigger waitlist escalation.

### D. Twilio reminder cron (`src/routes/api/public/hooks/reminders.ts`)
- Selects bookings where lesson `start_time` is in next 24h AND `reminder_sent_at IS NULL` AND `status='active'`.
- Sends SMS via the Twilio gateway to `profile.phone` with the 50% cancellation policy warning + reply-YES-to-confirm / reply-CANCEL-to-cancel copy.
- Stamps `reminder_sent_at`.
- Scheduled hourly via `pg_cron` → calls `https://project--cfd94e12-c7b5-476c-9415-b02b49d78e3e.lovable.app/api/public/hooks/reminders`.

### E. Twilio inbound SMS webhook (`src/routes/api/public/hooks/sms-inbound.ts`)
- Parses Twilio's form-encoded webhook (`From`, `Body`).
- Looks up the most recent reminded booking for that phone.
- `YES` → confirm (no-op, log). `CANCEL` → invokes the cancellation flow above.
- Returns TwiML reply.
- User will need to paste this URL into Twilio Console → Phone Number → Messaging webhook.

### F. Waitlist escalation (`src/lib/waitlist.server.ts`, called from D + on any cancel)
- On any booking transition to `status='canceled'`: grab earliest `waitlist` row for that `lesson_id` where `offered_at IS NULL`.
- Send Twilio SMS offering the slot with reply window. Stamp `offered_at = now()`, `offer_expires_at = now() + 15 min`.
- A second cron (`/api/public/hooks/expire-offers`, every 5 min) clears expired offers and rolls to the next waitlisted person.

### G. Cron registration (one-shot `supabase--insert`)
Two `cron.schedule` rows:
- `tennis-24h-reminders` hourly → `/api/public/hooks/reminders`
- `tennis-waitlist-expire` every 5 min → `/api/public/hooks/expire-offers`

## Things I'll ask for / need from you
- Twilio "from" number (E.164). I'll read it from a new secret `TWILIO_FROM_NUMBER` — I'll request it via the secrets tool.
- Confirmation that you accept the schema rename `cancellation_status → status` (touches ~3 files).

## What I will NOT do
- Recreate tables / convert to `BIGSERIAL`. You'd lose all data and break the live app.
- Build a parallel Supabase Edge Function for the Stripe webhook. The existing TanStack route is the supported path on this stack.

## Order of operations
1. Run the additive migration.
2. Request `TWILIO_FROM_NUMBER` secret.
3. Extend webhook + write cancel/waitlist/cron/inbound files in one batch.
4. Register cron jobs.
5. Smoke-test the reminder endpoint with `invoke-server-function`.

Reply "approved" (or with edits) and I'll execute.
