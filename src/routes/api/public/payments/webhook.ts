import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

let _supabase: SupabaseClient<Database> | null = null;
function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

async function handleCheckoutCompleted(session: any) {
  const metadata = session.metadata || {};
  const lessonId = metadata.lesson_id;
  const profileId = metadata.profile_id;
  const studentId = metadata.student_id || null;

  if (!lessonId || !profileId) {
    console.error("Missing lesson_id or profile_id in checkout session metadata", session.id);
    return;
  }

  const supabase = getSupabase();
  const paymentIntentId: string | null = session.payment_intent ?? null;
  const customerId: string | null = session.customer ?? null;

  const bookingPatch = {
    payment_status: "paid" as const,
    cancellation_status: "active" as const,
    stripe_payment_intent_id: paymentIntentId,
  };

  // Idempotent: check if a booking already exists for this lesson+profile (+student)
  let existingQuery = supabase
    .from("bookings")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("profile_id", profileId);
  existingQuery = studentId
    ? existingQuery.eq("student_id", studentId)
    : existingQuery.is("student_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    await supabase.from("bookings").update(bookingPatch).eq("id", existing.id);
  } else {
    await supabase.from("bookings").insert({
      lesson_id: lessonId,
      profile_id: profileId,
      student_id: studentId,
      ...bookingPatch,
    });
  }

  // Save Stripe customer + default payment method on the profile so future
  // bookings can charge off-session (24h cancellation penalty).
  if (customerId) {
    const profilePatch: Record<string, string> = { stripe_customer_id: customerId };
    if (paymentIntentId) {
      try {
        const { createStripeClient } = await import("@/lib/stripe.server");
        const stripe = createStripeClient("sandbox");
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const pm = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
        if (pm) {
          profilePatch.default_payment_method_id = pm;
          // Attach to customer for off_session reuse
          try {
            await stripe.paymentMethods.attach(pm, { customer: customerId });
          } catch (_) { /* may already be attached */ }
        }
      } catch (e) {
        console.error("Failed to retrieve payment intent for PM save", e);
      }
    }
    await supabase.from("profiles").update(profilePatch).eq("id", profileId);
  }

  console.log("Booking confirmed for lesson", lessonId, "profile", profileId);
}

async function handlePaymentIntentSucceeded(pi: any) {
  if (pi?.metadata?.kind !== "cancellation_penalty") return;
  const bookingId = pi.metadata.booking_id;
  if (!bookingId) return;
  await getSupabase()
    .from("bookings")
    .update({ payment_status: "penalty_charged" })
    .eq("id", bookingId);
}

async function handleChargeRefunded(charge: any) {
  const piId = charge?.payment_intent;
  if (!piId) return;
  await getSupabase()
    .from("bookings")
    .update({ payment_status: "refunded" })
    .eq("stripe_payment_intent_id", piId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook missing/invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
