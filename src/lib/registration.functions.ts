import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const participantSchema = z.object({
  localId: z.string().min(1).max(100),
  dbId: z.string().uuid().nullable().optional(),
  registrantType: z.enum(["adult", "junior"]),
  isAccountHolder: z.boolean(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  age: z.number().int().min(1).max(100).nullable().optional(),
  gender: z.string().trim().max(50).nullable().optional(),
});

const selectedLessonSchema = z.object({
  lessonId: z.string().uuid(),
  lessonName: z.string().trim().min(1).max(200),
  lessonDateTime: z.string().min(1).max(100),
  lessonEndTime: z.string().min(1).max(100),
  depositAmount: z.number().min(0).max(10000),
});

const bookingRegistrationSchema = participantSchema.extend({
  lessons: z.array(selectedLessonSchema).max(100),
});

const persistAccountSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
});

const persistParticipantsSchema = z.object({
  registrations: z.array(participantSchema).min(1).max(100),
});

const persistBookingsSchema = z.object({
  paymentMethod: z.string().trim().min(1).max(50),
  account: persistAccountSchema,
  registrations: z.array(bookingRegistrationSchema).min(1).max(100),
});

type ParticipantInput = z.infer<typeof participantSchema>;
type BookingRegistrationInput = z.infer<typeof bookingRegistrationSchema>;

async function upsertAccountHolderParticipant(userId: string, account: z.infer<typeof persistAccountSchema>) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("account_id", userId)
    .eq("is_account_holder", true)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("participants")
      .update({
        first_name: account.firstName,
        last_name: account.lastName || "Holder",
        participant_type: "adult",
        is_saved: true,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("participants")
    .insert({
      account_id: userId,
      first_name: account.firstName || "Account",
      last_name: account.lastName || "Holder",
      participant_type: "adult",
      is_account_holder: true,
      is_saved: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function upsertAccount(userId: string, account: z.infer<typeof persistAccountSchema>) {
  const { error: accountError } = await supabaseAdmin
    .from("accounts")
    .upsert(
      {
        id: userId,
        first_name: account.firstName,
        last_name: account.lastName,
        email: account.email,
        phone: account.phone,
      },
      { onConflict: "id" },
    );
  if (accountError) throw new Error(accountError.message);

  const fullName = `${account.firstName} ${account.lastName}`.trim();
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: fullName,
        email: account.email,
        phone: account.phone,
      },
      { onConflict: "id" },
    );
  if (profileError) throw new Error(profileError.message);

  const holderId = await upsertAccountHolderParticipant(userId, account);
  return holderId;
}

async function persistParticipantsForUser(userId: string, account: z.infer<typeof persistAccountSchema> | null, registrations: ParticipantInput[]) {
  let holderId: string | null = null;
  if (account) {
    holderId = await upsertAccount(userId, account);
  } else {
    const { data: holder } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("account_id", userId)
      .eq("is_account_holder", true)
      .maybeSingle();
    holderId = holder?.id ?? null;
  }

  const participantIds: Record<string, string> = {};

  for (const registration of registrations) {
    if (registration.isAccountHolder) {
      if (!holderId) {
        const firstName = registration.firstName || "Account";
        const lastName = registration.lastName || "Holder";
        holderId = await upsertAccountHolderParticipant(userId, {
          firstName,
          lastName,
          email: account?.email ?? "placeholder@example.com",
          phone: account?.phone ?? "0000000000",
        });
      }
      participantIds[registration.localId] = holderId;
      continue;
    }

    if (registration.dbId) {
      const { error } = await supabaseAdmin
        .from("participants")
        .update({
          first_name: registration.firstName,
          last_name: registration.lastName,
          participant_type: registration.registrantType,
          age: registration.age ?? null,
          gender: registration.gender ?? null,
          is_saved: true,
        })
        .eq("id", registration.dbId)
        .eq("account_id", userId);
      if (error) throw new Error(error.message);
      participantIds[registration.localId] = registration.dbId;
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from("participants")
      .insert({
        account_id: userId,
        first_name: registration.firstName,
        last_name: registration.lastName,
        participant_type: registration.registrantType,
        age: registration.age ?? null,
        gender: registration.gender ?? null,
        is_account_holder: false,
        is_saved: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    participantIds[registration.localId] = data.id;
  }

  return participantIds;
}

export const persistClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof persistAccountSchema>) => persistAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const holderId = await upsertAccount(context.userId, data);
    return { ok: true, holderId };
  });

export const persistRegistrationParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof persistParticipantsSchema>) => persistParticipantsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const participantIds = await persistParticipantsForUser(context.userId, null, data.registrations);
    return { ok: true, participantIds };
  });

export const persistLessonRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof persistBookingsSchema>) => persistBookingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const participantIds = await persistParticipantsForUser(userId, data.account, data.registrations);
    const nowIso = new Date().toISOString();

    const rows = [] as {
      account_id: string;
      participant_id: string;
      lesson_id: string;
      lesson_name: string;
      lesson_date: string;
      lesson_start_time: string;
      lesson_end_time: string;
      lesson_price: number;
      deposit_amount: number;
      deposit_status: string;
      payment_method: string;
      payment_reported_at: string;
      policy_acknowledged: boolean;
      policy_acknowledged_at: string;
      cancellation_status: string;
    }[];

    const seen = new Set<string>();
    for (const registration of data.registrations as BookingRegistrationInput[]) {
      const participantId = participantIds[registration.localId];
      if (!participantId) continue;

      for (const lesson of registration.lessons) {
        const key = `${participantId}::${lesson.lessonId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const start = new Date(lesson.lessonDateTime);
        const end = new Date(lesson.lessonEndTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

        rows.push({
          account_id: userId,
          participant_id: participantId,
          lesson_id: lesson.lessonId,
          lesson_name: lesson.lessonName,
          lesson_date: start.toISOString().slice(0, 10),
          lesson_start_time: start.toTimeString().slice(0, 8),
          lesson_end_time: end.toTimeString().slice(0, 8),
          lesson_price: lesson.depositAmount,
          deposit_amount: lesson.depositAmount,
          deposit_status: "Pending",
          payment_method: data.paymentMethod,
          payment_reported_at: nowIso,
          policy_acknowledged: true,
          policy_acknowledged_at: nowIso,
          cancellation_status: "Active",
        });
      }
    }

    if (rows.length === 0) return { ok: true, inserted: 0, skipped: 0, participantIds };

    const participantIdList = Array.from(new Set(rows.map((row) => row.participant_id)));
    const lessonIdList = Array.from(new Set(rows.map((row) => row.lesson_id)));
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("lesson_bookings")
      .select("participant_id, lesson_id")
      .in("participant_id", participantIdList)
      .in("lesson_id", lessonIdList)
      .eq("cancellation_status", "Active");
    if (existingError) throw new Error(existingError.message);

    const existingKeys = new Set(
      (existing ?? []).map((row) => `${row.participant_id}::${row.lesson_id}`),
    );
    const toInsert = rows.filter((row) => !existingKeys.has(`${row.participant_id}::${row.lesson_id}`));

    if (toInsert.length === 0) {
      return { ok: true, inserted: 0, skipped: rows.length, participantIds };
    }

    const { error } = await supabaseAdmin.from("lesson_bookings").insert(toInsert);
    if (error) throw new Error(error.message);

    return { ok: true, inserted: toInsert.length, skipped: rows.length - toInsert.length, participantIds };
  });
