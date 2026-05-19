import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createStripeClient } from "./stripe.server";
import { escalateWaitlist } from "./waitlist.server";
import { sendSms } from "./twilio.server";

let _admin: SupabaseClient<Database> | null = null;
function admin(): SupabaseClient<Database> {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _admin;
}

export type CancelResult =
  | { ok: true; outcome: "refunded" | "penalty_charged" | "canceled_no_charge"; amount?: number }
  | { ok: false; error: string };

/**
 * Cancel a booking. >24h before lesson → full refund. <24h → 50% off-session charge.
 * Always: set status canceled, escalate waitlist, optionally text the client.
 */
export async function cancelBooking(bookingId: string): Promise<CancelResult> {
  const sb = admin();

  const { data: booking, error } = await sb
    .from("bookings")
    .select("id, lesson_id, profile_id, payment_status, stripe_payment_intent_id, cancellation_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) return { ok: false, error: "booking not found" };
  if (booking.cancellation_status === "canceled") {
    return { ok: true, outcome: "canceled_no_charge" };
  }

  const [{ data: lesson }, { data: profile }] = await Promise.all([
    sb.from("lessons").select("start_time, price, title").eq("id", booking.lesson_id).maybeSingle(),
    sb.from("profiles").select("phone, stripe_customer_id, default_payment_method_id")
      .eq("id", booking.profile_id).maybeSingle(),
  ]);
  if (!lesson) return { ok: false, error: "lesson not found" };

  const hoursUntil = (new Date(lesson.start_time).getTime() - Date.now()) / 3_600_000;
  const stripe = createStripeClient("sandbox");
  let outcome: "refunded" | "penalty_charged" | "canceled_no_charge" = "canceled_no_charge";
  let amount: number | undefined;

  try {
    if (hoursUntil > 24 && booking.payment_status === "paid" && booking.stripe_payment_intent_id) {
      // Full refund
      await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
      outcome = "refunded";
    } else if (hoursUntil <= 24 && booking.payment_status === "paid"
        && profile?.stripe_customer_id && profile?.default_payment_method_id) {
      // 50% off-session penalty
      amount = Math.round(Number(lesson.price) * 100 * 0.5);
      await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        customer: profile.stripe_customer_id,
        payment_method: profile.default_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { kind: "cancellation_penalty", booking_id: bookingId },
      });
      outcome = "penalty_charged";
    }
  } catch (e) {
    console.error("Stripe cancel charge/refund failed", e);
    return { ok: false, error: `stripe: ${String(e)}` };
  }

  await sb
    .from("bookings")
    .update({
      cancellation_status: "canceled",
      canceled_at: new Date().toISOString(),
      ...(outcome === "refunded" ? { payment_status: "refunded" } : {}),
      ...(outcome === "penalty_charged" ? { payment_status: "penalty_charged" } : {}),
    })
    .eq("id", bookingId);

  // Notify client
  if (profile?.phone) {
    const msg = outcome === "refunded"
      ? `Your booking for "${lesson.title}" was canceled and a full refund is on the way.`
      : outcome === "penalty_charged"
      ? `Your booking for "${lesson.title}" was canceled. A 50% late-cancel fee of $${(amount! / 100).toFixed(2)} was charged per policy.`
      : `Your booking for "${lesson.title}" was canceled.`;
    await sendSms(profile.phone, msg).catch(() => {});
  }

  // Offer slot to next on waitlist
  await escalateWaitlist(booking.lesson_id);

  return { ok: true, outcome, amount };
}
