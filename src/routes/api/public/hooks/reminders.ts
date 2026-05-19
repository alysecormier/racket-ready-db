import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendSms } from "@/lib/twilio.server";
import { requireCronSecret } from "@/lib/webhook-auth.server";

/**
 * Cron-invoked every hour. Texts a reminder + cancellation-policy warning
 * to every active booking whose lesson starts within the next 24h and that
 * hasn't received a reminder yet.
 */
export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request);
        if (unauthorized) return unauthorized;
        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const { data: lessons } = await sb
          .from("lessons")
          .select("id, title, start_time, price")
          .gte("start_time", now.toISOString())
          .lte("start_time", in24h.toISOString());

        if (!lessons?.length) return Response.json({ sent: 0 });

        const lessonIds = lessons.map((l) => l.id);
        const { data: bookings } = await sb
          .from("bookings")
          .select("id, lesson_id, profile_id")
          .in("lesson_id", lessonIds)
          .eq("cancellation_status", "active")
          .is("reminder_sent_at", null);

        if (!bookings?.length) return Response.json({ sent: 0 });

        const profileIds = [...new Set(bookings.map((b) => b.profile_id))];
        const { data: profiles } = await sb
          .from("profiles")
          .select("id, phone, full_name")
          .in("id", profileIds);

        const pById = new Map((profiles ?? []).map((p) => [p.id, p]));
        const lById = new Map(lessons.map((l) => [l.id, l]));

        let sent = 0;
        for (const b of bookings) {
          const profile = pById.get(b.profile_id);
          const lesson = lById.get(b.lesson_id);
          if (!profile?.phone || !lesson) continue;

          const when = new Date(lesson.start_time).toLocaleString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          });
          const msg =
            `Reminder from Alyse's Tennis Camp: "${lesson.title}" is tomorrow at ${when}. ` +
            `Cancellations within 24h are subject to a 50% fee. ` +
            `Reply CANCEL to cancel now, or YES to confirm.`;
          const r = await sendSms(profile.phone, msg);
          if (!r.error) {
            await sb.from("bookings")
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq("id", b.id);
            sent++;
          }
        }
        return Response.json({ sent, considered: bookings.length });
      },
    },
  },
});
