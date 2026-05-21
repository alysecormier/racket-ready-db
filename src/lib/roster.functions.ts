import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is a coach
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coach")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Forbidden");

    const clientId = data.clientId;

    // Cascade deletes via service role (bypasses RLS)
    const steps: Array<{ label: string; run: () => Promise<{ error: { message: string } | null }> }> = [
      { label: "bookings", run: async () => await supabaseAdmin.from("bookings").delete().eq("profile_id", clientId) },
      { label: "waitlist", run: async () => await supabaseAdmin.from("waitlist").delete().eq("profile_id", clientId) },
      { label: "coach_notes", run: async () => await supabaseAdmin.from("coach_notes").delete().eq("client_id", clientId) },
      { label: "students", run: async () => await supabaseAdmin.from("students").delete().eq("parent_id", clientId) },
      { label: "profile", run: async () => await supabaseAdmin.from("profiles").delete().eq("id", clientId) },
    ];

    for (const s of steps) {
      const { error } = await s.run();
      if (error) throw new Error(`Failed to delete ${s.label}: ${error.message}`);
    }


    return { ok: true };
  });
