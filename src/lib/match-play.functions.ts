import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns the first names of other adults who opted in to "stay for match play"
 * on the given lesson. First names only — never expose email/phone/last names.
 */
export const getMatchPlayRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { lessonId: string }) =>
    z.object({ lessonId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("profile_id, student_id")
      .eq("lesson_id", data.lessonId)
      .eq("stay_for_match_play", true)
      .eq("cancellation_status", "active")
      .eq("payment_status", "paid");

    if (!bookings || bookings.length === 0) return { roster: [] as string[] };

    // Only "adult" bookings (no student attached) — Morning Mix is adult-only.
    const profileIds = Array.from(
      new Set(bookings.filter((b) => !b.student_id).map((b) => b.profile_id)),
    );
    if (profileIds.length === 0) return { roster: [] as string[] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .in("id", profileIds);

    const firstNames = (profiles ?? [])
      .map((p) => (p.full_name ?? "").trim().split(/\s+/)[0])
      .filter(Boolean);

    return { roster: firstNames };
  });
