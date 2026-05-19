import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Simulate a returning paid client: ensures john@test.com exists, waiver signed,
 * and has a mock Stripe customer + saved card on file.
 * Coach-only.
 */
export const simulateReturningClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "coach")
      .maybeSingle();
    if (!roleRow) throw new Error("Coach only");

    const email = "john@test.com";
    const password = "Password123!";

    // Find or create the auth user
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    let user = list?.users.find((u) => u.email === email) ?? null;
    if (!user) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "John Doe" },
      });
      if (createErr) throw new Error(createErr.message);
      user = created.user;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    }
    if (!user) throw new Error("Failed to create user");

    await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email,
      full_name: "John Doe",
      phone: "(555) 010-1010",
      waiver_signed: true,
      waiver_signature: "John Doe",
      waiver_signed_at: new Date().toISOString(),
      stripe_customer_id: `cus_mock_${user.id.slice(0, 8)}`,
      saved_card_last4: "4242",
    });

    return { email, password, userId: user.id };
  });

/**
 * Mock checkout for a returning client paying with their saved card on file.
 * Creates a paid booking immediately. (No real Stripe charge.)
 */
export const payWithSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { lessonId: string; studentId?: string | null }) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(data.lessonId)) throw new Error("Invalid lessonId");
    if (data.studentId && !uuid.test(data.studentId)) throw new Error("Invalid studentId");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, saved_card_last4, waiver_signed")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.stripe_customer_id || !profile?.saved_card_last4) {
      throw new Error("No saved payment method");
    }
    const { error } = await supabase.from("bookings").insert({
      lesson_id: data.lessonId,
      profile_id: userId,
      student_id: data.studentId ?? null,
      payment_status: "paid",
      cancellation_status: "active",
      signed_waiver: !!profile.waiver_signed,
      signed_at: profile.waiver_signed ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, last4: profile.saved_card_last4 };
  });
