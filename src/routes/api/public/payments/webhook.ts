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
    await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        cancellation_status: "active",
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("bookings").insert({
      lesson_id: lessonId,
      profile_id: profileId,
      student_id: studentId,
      payment_status: "paid",
      cancellation_status: "active",
    });
  }

  console.log("Booking confirmed for lesson", lessonId, "profile", profileId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
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
