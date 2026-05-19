import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const schema = z.object({
  signature: z.string().trim().min(2).max(100),
});

/**
 * Sign the waiver for the authenticated user. Goes through the admin client so
 * the profiles trigger guard (which blocks regular users from self-writing
 * waiver_* columns) is bypassed by the trusted server only.
 */
export const signWaiver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signature: string }) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
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
