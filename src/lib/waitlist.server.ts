import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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

/**
 * When a booking is canceled (or an offer expires), offer the slot to the next
 * person on the waitlist for that lesson. Stamps a 15-minute response window.
 */
export async function escalateWaitlist(lessonId: string): Promise<void> {
  const sb = admin();

  // Find earliest waitlist entry that hasn't been offered yet (and not declined).
  const { data: next, error } = await sb
    .from("waitlist")
    .select("id, profile_id, lesson_id")
    .eq("lesson_id", lessonId)
    .is("offered_at", null)
    .eq("offer_declined", false)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("waitlist lookup failed", error);
    return;
  }
  if (!next) {
    console.log("waitlist empty for lesson", lessonId);
    return;
  }

  const [{ data: profile }, { data: lesson }] = await Promise.all([
    sb.from("profiles").select("phone, full_name").eq("id", next.profile_id).maybeSingle(),
    sb.from("lessons").select("title, start_time, price").eq("id", lessonId).maybeSingle(),
  ]);

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await sb
    .from("waitlist")
    .update({ offered_at: new Date().toISOString(), offer_expires_at: expiresAt })
    .eq("id", next.id);

  if (profile?.phone && lesson) {
    const when = new Date(lesson.start_time).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const msg =
      `Alyse's Tennis Camp: a spot just opened up for "${lesson.title}" on ${when} ($${lesson.price}). ` +
      `Reply YES within 15 minutes to claim it, or STOP to pass.`;
    await sendSms(profile.phone, msg);
  }
}

/**
 * Called by cron every few minutes — clears expired offers and rolls to next.
 */
export async function expireOffersAndRoll(): Promise<{ rolled: number }> {
  const sb = admin();
  const { data: expired } = await sb
    .from("waitlist")
    .select("id, lesson_id")
    .lt("offer_expires_at", new Date().toISOString())
    .not("offered_at", "is", null)
    .eq("offer_accepted", false)
    .eq("offer_declined", false);

  if (!expired?.length) return { rolled: 0 };

  for (const row of expired) {
    await sb.from("waitlist").update({ offer_declined: true }).eq("id", row.id);
    await escalateWaitlist(row.lesson_id as string);
  }
  return { rolled: expired.length };
}
