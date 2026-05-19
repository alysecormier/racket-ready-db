import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cancelBooking } from "./cancel.server";

export const cancelMyBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string }) =>
    z.object({ bookingId: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify ownership via RLS-scoped client
    const { data: b } = await supabase
      .from("bookings")
      .select("id, profile_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b || b.profile_id !== userId) {
      return { ok: false as const, error: "not your booking" };
    }
    return cancelBooking(data.bookingId);
  });
