import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import { sendSms } from "@/lib/twilio.server";

const SMS_BODY =
  "Notice from Alyse's Tennis Camp: Today's session has been canceled due to rain. A full refund has been initiated back to your card.";

export const cancelLessonForWeather = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { lessonId: string; environment: StripeEnv }) =>
    z.object({
      lessonId: z.string().uuid(),
      environment: z.enum(["sandbox", "live"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Coach-only
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "coach")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: coach role required");

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("id, profile_id, payment_status, stripe_payment_intent_id, cancellation_status")
      .eq("lesson_id", data.lessonId)
      .neq("cancellation_status", "canceled");
    if (error) throw new Error(error.message);

    const stripe = createStripeClient(data.environment);
    const results: Array<{ bookingId: string; refunded: boolean; sms: boolean; error?: string }> = [];

    for (const b of bookings ?? []) {
      let refunded = false;
      let sms = false;
      let errMsg: string | undefined;

      // 1) Refund (only if previously paid)
      if (b.payment_status === "paid" && b.stripe_payment_intent_id) {
        try {
          await stripe.refunds.create({ payment_intent: b.stripe_payment_intent_id });
          refunded = true;
        } catch (e) {
          errMsg = `refund failed: ${e instanceof Error ? e.message : String(e)}`;
          console.error("[weather-cancel] refund failed", b.id, e);
        }
      }

      // 2) Update booking (admin bypasses guard trigger)
      await supabaseAdmin
        .from("bookings")
        .update({
          cancellation_status: "canceled",
          canceled_at: new Date().toISOString(),
          ...(refunded ? { payment_status: "refunded" } : {}),
        })
        .eq("id", b.id);

      // 3) SMS the registered adult/parent
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", b.profile_id)
        .maybeSingle();
      if (profile?.phone) {
        const sent = await sendSms(profile.phone, SMS_BODY);
        sms = !sent.error;
        if (sent.error && !errMsg) errMsg = `sms failed: ${sent.error}`;
      }

      results.push({ bookingId: b.id, refunded, sms, ...(errMsg ? { error: errMsg } : {}) });
    }

    return { canceledCount: results.length, results };
  });
