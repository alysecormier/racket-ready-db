import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cancelBooking } from "@/lib/cancel.server";
import { verifyTwilioSignature } from "@/lib/webhook-auth.server";

/**
 * Twilio inbound SMS webhook. Configure in Twilio Console under your
 * phone number's "A MESSAGE COMES IN" setting.
 * Verifies X-Twilio-Signature so attackers can't spoof the From field.
 */
function twiml(reply: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply.replace(/[<&>]/g, "")}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

export const Route = createFileRoute("/api/public/hooks/sms-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken) {
          console.error("TWILIO_AUTH_TOKEN not configured");
          return new Response("Misconfigured", { status: 500 });
        }

        // Read body once as text so we can both verify and parse it.
        const rawBody = await request.text();
        const formParams = new URLSearchParams(rawBody);
        const paramsObj: Record<string, string> = {};
        formParams.forEach((v, k) => { paramsObj[k] = v; });

        const signature = request.headers.get("x-twilio-signature");
        // Twilio signs the public URL the request was sent to. Honor
        // X-Forwarded-* headers since we run behind a proxy.
        const proto = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
        const path = new URL(request.url).pathname + new URL(request.url).search;
        const publicUrl = `${proto}://${host}${path}`;

        if (!verifyTwilioSignature(authToken, publicUrl, paramsObj, signature)) {
          console.warn("Rejected SMS webhook: bad Twilio signature");
          return new Response("Forbidden", { status: 403 });
        }

        const from = String(paramsObj.From || "");
        const body = String(paramsObj.Body || "").trim().toUpperCase();
        if (!from) return twiml("");

        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: profile } = await sb
          .from("profiles")
          .select("id")
          .eq("phone", from)
          .maybeSingle();
        if (!profile) return twiml("We couldn't find an account for this number.");

        const { data: booking } = await sb
          .from("bookings")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("cancellation_status", "active")
          .not("reminder_sent_at", "is", null)
          .order("reminder_sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: offer } = await sb
          .from("waitlist")
          .select("id, lesson_id")
          .eq("profile_id", profile.id)
          .not("offered_at", "is", null)
          .eq("offer_accepted", false)
          .eq("offer_declined", false)
          .gt("offer_expires_at", new Date().toISOString())
          .order("offered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (body === "YES" && offer) {
          await sb.from("waitlist").update({ offer_accepted: true }).eq("id", offer.id);
          return twiml("Great — your spot is held. Check your portal to complete checkout.");
        }
        if (body === "STOP" || body === "NO") {
          if (offer) {
            await sb.from("waitlist").update({ offer_declined: true }).eq("id", offer.id);
            return twiml("No problem — we'll offer the slot to the next person.");
          }
        }
        if (body === "CANCEL" && booking) {
          const r = await cancelBooking(booking.id);
          if (!r.ok) return twiml("Sorry, we couldn't cancel that. Please use the portal.");
          if (r.outcome === "refunded") return twiml("Booking canceled. Full refund issued.");
          if (r.outcome === "penalty_charged") return twiml("Booking canceled. 50% late-cancel fee applied per policy.");
          return twiml("Booking canceled.");
        }
        if (body === "YES" && booking) {
          return twiml("Thanks — see you on the court!");
        }
        return twiml("Reply YES to confirm, CANCEL to cancel, or visit your portal.");
      },
    },
  },
});
