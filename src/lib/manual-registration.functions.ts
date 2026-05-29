import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const paymentMethodSchema = z.enum(["Zelle", "Venmo", "Apple Pay", "Cash App"]);

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
});

const registrationSchema = z.object({
  localId: z.string().min(1).max(100),
  isAccountHolder: z.boolean(),
  playerType: z.enum(["adult", "junior"]),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  age: z.number().int().min(1).max(100).nullable().optional(),
  gender: z.string().trim().max(50).nullable().optional(),
  lessons: z.array(z.object({
    lessonId: z.string().uuid(),
    stayForMatchPlay: z.boolean().optional(),
  })).min(1).max(100),
});

const payloadSchema = z.object({
  profile: profileSchema,
  registrations: z.array(registrationSchema).min(1).max(100),
  paymentMethod: paymentMethodSchema,
});

type RegistrationInput = z.infer<typeof registrationSchema>;

function fullPlayerName(reg: RegistrationInput) {
  return `${reg.firstName} ${reg.lastName}`.trim();
}

async function upsertProfile(userId: string, profile: z.infer<typeof profileSchema>) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
      },
      { onConflict: "id" },
    );

  if (error) throw new Error(error.message);
}

async function upsertStudent(userId: string, reg: RegistrationInput) {
  const name = fullPlayerName(reg);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("parent_id", userId)
    .ilike("name", name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("students")
      .update({
        name,
        age: reg.age ?? null,
        gender: reg.gender ?? null,
      })
      .eq("id", existing.id)
      .eq("parent_id", userId);

    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("students")
    .insert({
      parent_id: userId,
      name,
      age: reg.age ?? null,
      gender: reg.gender ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export const createManualLessonRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof payloadSchema>) => payloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    await upsertProfile(userId, data.profile);

    const rows: {
      lesson_id: string;
      profile_id: string;
      student_id: string | null;
      payment_status: string;
      cancellation_status: string;
      signed_waiver: boolean;
      stay_for_match_play: boolean;
    }[] = [];

    const seen = new Set<string>();

    for (const reg of data.registrations) {
      const studentId = reg.isAccountHolder ? null : await upsertStudent(userId, reg);

      for (const lesson of reg.lessons) {
        const key = `${lesson.lessonId}::${studentId ?? "adult"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          lesson_id: lesson.lessonId,
          profile_id: userId,
          student_id: studentId,
          payment_status: "pending",
          cancellation_status: "active",
          signed_waiver: true,
          stay_for_match_play: lesson.stayForMatchPlay === true,
        });
      }
    }

    if (rows.length === 0) {
      return { ok: true, inserted: 0, skipped: 0 };
    }

    const lessonIds = Array.from(new Set(rows.map((row) => row.lesson_id)));
    const studentIds = rows.map((row) => row.student_id).filter(Boolean) as string[];

    let existingQuery = supabaseAdmin
      .from("bookings")
      .select("lesson_id, student_id")
      .eq("profile_id", userId)
      .in("lesson_id", lessonIds)
      .eq("cancellation_status", "active");

    if (studentIds.length > 0) {
      existingQuery = existingQuery.or(`student_id.in.(${studentIds.join(",")}),student_id.is.null`);
    } else {
      existingQuery = existingQuery.is("student_id", null);
    }

    const { data: existing, error: existingError } = await existingQuery;
    if (existingError) throw new Error(existingError.message);

    const existingKeys = new Set(
      (existing ?? []).map((row) => `${row.lesson_id}::${row.student_id ?? "adult"}`),
    );

    const toInsert = rows.filter((row) => !existingKeys.has(`${row.lesson_id}::${row.student_id ?? "adult"}`));

    if (toInsert.length === 0) {
      return { ok: true, inserted: 0, skipped: rows.length };
    }

    const { error } = await supabaseAdmin.from("bookings").insert(toInsert);
    if (error) throw new Error(error.message);

    return { ok: true, inserted: toInsert.length, skipped: rows.length - toInsert.length };
  });
