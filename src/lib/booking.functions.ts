import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createLessonBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    lessonId: string;
    studentId?: string | null;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(data.lessonId)) throw new Error("Invalid lessonId");
    if (data.studentId && !uuid.test(data.studentId)) throw new Error("Invalid studentId");
    if (typeof data.returnUrl !== "string" || data.returnUrl.length > 500) throw new Error("Invalid returnUrl");
    if (data.environment !== "sandbox" && data.environment !== "live") throw new Error("Invalid environment");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Fetch lesson + verify capacity (RLS-scoped read)
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, title, price, capacity, start_time, end_time")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (lessonError) throw new Error(lessonError.message);
    if (!lesson) throw new Error("Lesson not found");

    const priceCents = Math.round(Number(lesson.price) * 100);
    if (!priceCents || priceCents < 50) throw new Error("Lesson price is invalid");

    const stripe = createStripeClient(data.environment);
    const email = (claims as { email?: string } | null)?.email;

    const customerId = await resolveOrCreateCustomer(stripe, {
      email,
      userId,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      return_url: data.returnUrl,
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: lesson.title,
            description: `Tennis lesson on ${new Date(lesson.start_time).toLocaleString()}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        description: lesson.title,
        metadata: {
          lesson_id: data.lessonId,
          profile_id: userId,
          ...(data.studentId && { student_id: data.studentId }),
        },
      },
      metadata: {
        lesson_id: data.lessonId,
        profile_id: userId,
        ...(data.studentId && { student_id: data.studentId }),
      },
    });

    return session.client_secret;
  });
