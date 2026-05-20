# Plan

## 1. Strip the mock "john@test.com" path
- **Delete** `src/lib/mock-client.functions.ts` (the `simulateReturningClient` and `payWithSavedCard` server fns).
- **`src/routes/admin.tsx`**: remove the "Simulate returning client" card + the import.
- **`src/routes/onboarding.tsx`**:
  - Remove `payWithSavedCard` import and the "Pay with saved card on file" branch in `PaymentStep`. Everyone goes through real Stripe Checkout.
  - Keep the existing `supabase.auth.getUser()` gate; nothing else auto-logs anyone in. I'll also add an explicit redirect to `/login` if step >= 3 and no session.
- Nothing in the codebase actually hard-codes auto-sign-in to `john@test.com` — the only thing tied to that email is the seeding helper above. If you also want me to **delete the seeded `john@test.com` auth user** from the database, say the word and I'll run it.

## 2. Monthly calendar in onboarding Step 4
- Replace `CalendarView` (currently a single Mon–Sun strip) with a real month grid:
  - Header with **‹ Month YYYY ›** prev/next buttons (no upper bound, so user can page to Jun/Jul/Aug 2026).
  - 7-column day grid for the visible month, each cell shows the day number + up to N lesson chips (time + title + price + capacity), with "+X more" overflow.
  - Clicking a chip selects that lesson (same `setSelectedLessonId` flow as today). Full slots show "Join waitlist".
  - Mobile: keep horizontal scroll wrapper so the 420px viewport still works.
- List view stays as a fallback toggle.

## 3. Lesson type presets + match-play opt-in
**DB migration:**
- `lessons.lesson_type text` (nullable) — one of `mens_womens_morning_mix`, `camp_3_6`, `camp_7_10`, `camp_11_14`, or `null` for legacy/custom.
- `bookings.stay_for_match_play boolean default false`.
- Trigger update: allow users to set `stay_for_match_play` on their own bookings (the existing `guard_bookings_payment_fields` trigger is OK because that field isn't in the guarded list; I'll just confirm).

**Admin (`/admin` session creator):**
- Add a "Preset" dropdown above the manual fields. Selecting a preset prefills title, start/end time (date picker stays manual), price, capacity, and stores `lesson_type`.
- Morning Mix price is a flexible field with default $35, hint "$35–$40".

**Client booking UI:**
- In `PaymentStep`, if `lesson.lesson_type === 'mens_womens_morning_mix'`, show a checkbox: **"Staying after for organized match play?"**. Persisted to `bookings.stay_for_match_play` on creation (passed through Stripe Checkout metadata → webhook insert).
- In the lesson detail panel on Step 4, if the selected lesson is the Morning Mix, fetch and show the list of *first names* of other adults in that slot who opted into match play (via a new server fn that returns names only — no email/phone leakage).

## 4. Weather cancellation
**Server fn `cancelLessonForWeather(lessonId)`** (coach-only, in `src/lib/cancel.functions.ts`):
- Verify caller has `coach` role.
- Load all active bookings for that lesson with profile phone + payment intent + price.
- For each booking:
  - Issue full Stripe refund via `stripe.refunds.create({ payment_intent })` (using `createStripeClient` — gateway).
  - Update booking to `cancellation_status='canceled'`, `payment_status='refunded'`, `canceled_at=now()` (via admin client, bypasses trigger).
  - Send Twilio SMS: *"Notice from Alyse's Tennis Camp: Today's session has been canceled due to rain. A full refund has been initiated back to your card."*
- Return per-booking outcomes; surface failures in a toast.

**Admin UI (`/admin` coach calendar):**
- Add a `CloudRainOff` icon button next to each scheduled lesson row, labeled "Cancel due to weather". Confirmation dialog → calls the server fn → toast results.

## Out of scope (flag for follow-up unless you say otherwise)
- I will not build a brand-new "Coach Calendar" view if `/admin` doesn't already render lessons in a list; I'll add the button to whatever list is already there. If `/admin` has no per-lesson row yet, I'll add a minimal upcoming-lessons list to host the button.
- I won't change the existing 24h cancellation policy / penalty logic — weather cancel is its own path that always refunds 100%.

## Tech notes
- The webhook (`src/routes/api/public/payments/webhook.ts`) needs to read `stay_for_match_play` from Checkout session metadata and write it on booking insert.
- New "match play roster" server fn returns `{ firstName: string }[]` only.
- Real Stripe Checkout is already wired via `createLessonBookingCheckout` — removing the mock card path just means everyone routes through that.

---

**Two quick confirms before I build:**
1. OK to **delete** the mock test path entirely (server fn + admin button + saved-card pay branch)? Or do you want to keep `payWithSavedCard` for real returning customers who later have a real saved card?
2. For the match-play social view — show **first names only** (privacy-safe default), or full names?
