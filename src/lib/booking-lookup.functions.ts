import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";

export const getBookingBySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (typeof data.sessionId !== "string" || data.sessionId.length > 200 || !/^[a-zA-Z0-9_]+$/.test(data.sessionId)) {
      throw new Error("Invalid sessionId");
    }
    if (data.environment !== "sandbox" && data.environment !== "live") throw new Error("Invalid environment");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    const lessonId = session.metadata?.lesson_id;
    const sessionProfileId = session.metadata?.profile_id;
    if (!lessonId) return null;
    if (sessionProfileId && sessionProfileId !== userId) return null;

    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("id, title, start_time, end_time, location, description")
      .eq("id", lessonId)
      .maybeSingle();
    if (error || !lesson) return null;
    return lesson;
  });
