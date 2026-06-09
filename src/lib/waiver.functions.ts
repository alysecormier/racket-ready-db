import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  signature: z.string().trim().min(2).max(100),
});

/**
 * Sign the waiver for the authenticated user. Writes through the user's own
 * RLS-scoped Supabase client; the profiles trigger allows owner self-signing.
 */
export const signWaiver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signature: string }) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // If already signed, no-op (the DB trigger blocks re-signing).
    const { data: existing } = await supabase
      .from("profiles")
      .select("waiver_signed")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.waiver_signed) {
      return { ok: true, alreadySigned: true };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        waiver_signed: true,
        waiver_signature: data.signature,
        waiver_signed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
