import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";
import { CheckCircle2, AlertTriangle, CalendarDays, DollarSign, Plus, X, Pencil, Check, Download } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { signWaiver } from "@/lib/waiver.functions";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>) => ({
    book: search.book === "1" || search.book === 1 ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Welcome to 2026 Tennis Lessons" },
      { name: "description", content: "Welcome to 2026 Tennis Lessons — register in a few simple steps." },
    ],
  }),
  component: OnboardingPage,
});

type Lesson = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  capacity: number;
  price: number;
  booked: number;
  lesson_type?: string | null;
};

type RegistrantType = "adult" | "junior";

type SelectedLesson = {
  lessonId: string;
  lessonName: string;
  lessonDateTime: string;
  lessonEndTime: string;
  depositAmount: number;
  depositStatus: "Pending";
  cancellationStatus: "Active";
  cancellationRequestedAt: string | null;
};

type Registration = {
  id: string;
  /** Supabase participants.id once persisted */
  dbId?: string | null;
  registrantType: RegistrantType;
  isAccountHolder: boolean;
  fromSaved?: boolean;
  player: {
    firstName: string;
    lastName: string;
    age: number | null;
    gender: string | null;
  };
  lessons: SelectedLesson[];
  participantSubtotal: number;
};

type SavedParticipant = {
  id: string;
  first_name: string;
  last_name: string;
  participant_type: RegistrantType;
  age: number | null;
  gender: string | null;
};

const GENDERS = ["Boy", "Girl", "Prefer Not to Say"] as const;

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(7, "Phone is too short").max(20),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const STEPS = ["Sign Up", "Players & Lessons", "Waiver", "Review", "Payment"] as const;

const WAIVER_TEXT = `LIABILITY WAIVER AND RELEASE OF CLAIMS

In consideration of being permitted to participate in tennis lessons, clinics, programs, and related activities ("Activities") offered by 2026 Tennis Lessons at Fairground Park, Eunice, Louisiana, I, the undersigned participant (or parent/legal guardian of the participant), acknowledge and agree to the following:

1. ASSUMPTION OF RISK. Tennis and related athletic activities involve inherent risks. I voluntarily assume all such risks for myself and any minor participants I am registering.

2. RELEASE OF LIABILITY. I hereby release, waive, and discharge the organizer, coaches, employees, agents, and affiliates from any and all claims arising out of or related to any loss, damage, or injury sustained during the Activities, except in cases of gross negligence or willful misconduct.

3. MEDICAL TREATMENT. I authorize emergency medical treatment for any participant in my registration if necessary, and I agree to be responsible for any costs incurred.

4. PHOTO/VIDEO RELEASE. I consent to the use of photographs or video taken during Activities for promotional purposes, unless I notify the organizer in writing otherwise.

5. CANCELLATION POLICY. Cancellations made less than 24 hours before a scheduled lesson will incur a 50% fee. No-shows forfeit the deposit. Cancellation policy applies per individual lesson booking.

6. GOVERNING LAW. This waiver shall be governed by the laws of the State of Louisiana.

By typing my name below as a digital signature, I agree this constitutes a legally binding electronic signature for myself and all participants in this registration.`;

function newId() {
  return (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function splitName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function formatLessonOptionLabel(l: Lesson): string {
  const d = new Date(l.start_time);
  const e = new Date(l.end_time);
  return `${l.title} — ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · $${Number(l.price).toFixed(0)}`;
}

function formatLessonDateTime(l: Lesson): string {
  const d = new Date(l.start_time);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function OnboardingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const signWaiverFn = useServerFn(signWaiver);
  const [step, setStep] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);

  // step 0 (account)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // step 1 (players & lessons) — multi-participant cart
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [scrollToRegId, setScrollToRegId] = useState<string | null>(null);
  const [attemptedContinue, setAttemptedContinue] = useState(false);

  // step 2 (waiver)
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");

  // shared lessons pool
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);

  // admin-controlled active week (Date at midnight, Sunday of week)
  const [activeWeekStart, setActiveWeekStart] = useState<Date | null>(null);

  // saved participants from previous registrations
  const [savedParticipants, setSavedParticipants] = useState<SavedParticipant[]>([]);

  // Persist account row + account-holder participant. Idempotent (upsert by id).
  async function persistAccountHolder(
    userId: string,
    fields: { firstName: string; lastName: string; email: string; phone: string },
  ) {
    const { error: accErr } = await supabase
      .from("accounts")
      .upsert(
        {
          id: userId,
          first_name: fields.firstName,
          last_name: fields.lastName,
          email: fields.email,
          phone: fields.phone,
        },
        { onConflict: "id" },
      );
    if (accErr) console.error("accounts upsert", accErr);

    // ensure account-holder participant exists exactly once
    const { data: existing } = await supabase
      .from("participants")
      .select("id")
      .eq("account_id", userId)
      .eq("is_account_holder", true)
      .maybeSingle();
    if (!existing) {
      await supabase.from("participants").insert({
        account_id: userId,
        first_name: fields.firstName || "Account",
        last_name: fields.lastName || "Holder",
        participant_type: "adult",
        is_account_holder: true,
        is_saved: true,
      });
    } else {
      await supabase
        .from("participants")
        .update({ first_name: fields.firstName, last_name: fields.lastName })
        .eq("id", existing.id);
    }
  }

  // Persist any registrations that don't yet have a participants.id
  async function persistAdditionalParticipants() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const updated: Registration[] = [];
    for (const r of registrations) {
      if (r.isAccountHolder || r.dbId) { updated.push(r); continue; }
      const { data, error } = await supabase
        .from("participants")
        .insert({
          account_id: user.id,
          first_name: r.player.firstName.trim(),
          last_name: r.player.lastName.trim(),
          participant_type: r.registrantType,
          age: r.player.age,
          gender: r.player.gender,
          is_account_holder: false,
          is_saved: true,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("participants insert", error);
        updated.push(r);
      } else {
        updated.push({ ...r, dbId: data.id });
      }
    }
    setRegistrations(updated);
    return updated;
  }

  // Persist all selected lessons across all participants as lesson_bookings
  // Persist all selected lessons across all participants as lesson_bookings
  // Returns true on success, false on error
  async function persistBookings(paymentMethod: string, paymentReference: string | null): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    // ensure account-holder participant id
    let holderDbId: string | null = null;
    const { data: holderRow } = await supabase
      .from("participants")
      .select("id")
      .eq("account_id", user.id)
      .eq("is_account_holder", true)
      .maybeSingle();
    holderDbId = holderRow?.id ?? null;

    // also persist any participants missing dbId
    const persisted = await persistAdditionalParticipants();
    const regs = persisted ?? registrations;

    const nowIso = new Date().toISOString();
    type Row = {
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
      payment_reference: string | null;
      payment_reported_at: string;
      policy_acknowledged: boolean;
      policy_acknowledged_at: string;
      cancellation_status: string;
      is_waitlisted: boolean;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();
    for (const r of regs) {
      const pid = r.isAccountHolder ? holderDbId : r.dbId;
      if (!pid) continue;
      for (const l of r.lessons) {
        const key = `${pid}::${l.lessonId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = new Date(l.lessonDateTime);
        const end = new Date(l.lessonEndTime);
        rows.push({
          account_id: user.id,
          participant_id: pid,
          lesson_id: l.lessonId,
          lesson_name: l.lessonName,
          lesson_date: start.toISOString().slice(0, 10),
          lesson_start_time: start.toTimeString().slice(0, 8),
          lesson_end_time: end.toTimeString().slice(0, 8),
          lesson_price: l.depositAmount,
          deposit_amount: l.depositAmount,
          deposit_status: "Confirmed",
          payment_method: paymentMethod,
          payment_reference: paymentReference,
          payment_reported_at: nowIso,
          policy_acknowledged: true,
          policy_acknowledged_at: nowIso,
          cancellation_status: "Active",
          is_waitlisted: false,
        });
      }
    }
    if (rows.length === 0) return true;
    // Filter out rows that already have an Active booking (partial unique
    // index can't be used with ON CONFLICT, so we dedup manually).
    const participantIds = Array.from(new Set(rows.map((r) => r.participant_id)));
    const lessonIds = Array.from(new Set(rows.map((r) => r.lesson_id)));
    const { data: existing } = await supabase
      .from("lesson_bookings")
      .select("participant_id, lesson_id, is_waitlisted")
      .in("participant_id", participantIds)
      .in("lesson_id", lessonIds)
      .eq("cancellation_status", "Active");
    const existingKeys = new Set(
      (existing ?? []).map((e: { participant_id: string; lesson_id: string }) => `${e.participant_id}::${e.lesson_id}`),
    );
    const toInsert = rows.filter((r) => !existingKeys.has(`${r.participant_id}::${r.lesson_id}`));
    if (toInsert.length === 0) return true;

    // Capacity check: for each lesson, count confirmed (non-waitlisted) Active
    // bookings and compare to lesson capacity. Anything over capacity becomes
    // a waitlist entry instead of a confirmed seat.
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, capacity")
      .in("id", lessonIds);
    const capacityMap = new Map<string, number>(
      (lessonRows ?? []).map((l) => [l.id, Number(l.capacity ?? 0)]),
    );
    const confirmedCounts = new Map<string, number>();
    (existing ?? []).forEach((e: { lesson_id: string; is_waitlisted: boolean }) => {
      if (!e.is_waitlisted) {
        confirmedCounts.set(e.lesson_id, (confirmedCounts.get(e.lesson_id) ?? 0) + 1);
      }
    });
    let waitlistedCount = 0;
    for (const r of toInsert) {
      const cap = capacityMap.get(r.lesson_id) ?? 0;
      const taken = confirmedCounts.get(r.lesson_id) ?? 0;
      if (cap > 0 && taken >= cap) {
        r.is_waitlisted = true;
        r.deposit_status = "Waitlisted";
        r.deposit_amount = 0;
        waitlistedCount += 1;
      } else {
        confirmedCounts.set(r.lesson_id, taken + 1);
      }
    }

    const { error } = await supabase.from("lesson_bookings").insert(toInsert);
    if (error) {
      console.error("lesson_bookings insert", error);
      return false;
    }
    if (waitlistedCount > 0) {
      toast.info(
        waitlistedCount === 1
          ? "One lesson was full — you've been added to the waitlist."
          : `${waitlistedCount} lessons were full — you've been added to the waitlist.`,
      );
    }
    return true;
  }



  async function loadSavedParticipants() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavedParticipants([]); return; }
    const { data } = await supabase
      .from("participants")
      .select("id, first_name, last_name, participant_type, age, gender, is_account_holder, is_saved")
      .eq("account_id", user.id)
      .eq("is_saved", true)
      .eq("is_account_holder", false)
      .order("created_at", { ascending: true });
    setSavedParticipants(
      (data ?? []).map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        participant_type: p.participant_type as RegistrantType,
        age: p.age,
        gender: p.gender,
      })),
    );
  }



  // On mount: if user is already signed in, either redirect to /dashboard
  // or (when ?book=1) hydrate their profile and jump straight to step 1.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setBootstrapping(false);
        return;
      }
      if (search.book !== 1) {
        navigate({ to: "/dashboard" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setEmail(profile.email ?? user.email ?? "");
      } else {
        setEmail(user.email ?? "");
      }
      setStep(1);
      setBootstrapping(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  // Initialize account holder registration once we know the name
  useEffect(() => {
    if (step !== 1) return;
    setRegistrations((prev) => {
      if (prev.some((r) => r.isAccountHolder)) return prev;
      const { first, last } = splitName(fullName);
      const holder: Registration = {
        id: newId(),
        registrantType: "adult",
        isAccountHolder: true,
        player: { firstName: first, lastName: last, age: null, gender: null },
        lessons: [],
        participantSubtotal: 0,
      };
      return [holder, ...prev];
    });
  }, [step, fullName]);

  // Load lessons whenever entering step 1
  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    (async () => {
      setLessonsLoading(true);
      const nowIso = new Date().toISOString();
      const [{ data: lessonRows, error: lessonErr }, { data: bookingRows }] = await Promise.all([
        supabase
          .from("lessons")
          .select("id, title, start_time, end_time, capacity, price, lesson_type")
          .gte("start_time", nowIso)
          .order("start_time", { ascending: true })
          .limit(50),
        supabase
          .from("lesson_bookings")
          .select("lesson_id")
          .eq("cancellation_status", "Active")
          .eq("is_waitlisted", false),
      ]);
      if (cancelled) return;
      if (lessonErr) toast.error(lessonErr.message);
      const counts = new Map<string, number>();
      (bookingRows ?? []).forEach((b) => {
        counts.set(b.lesson_id, (counts.get(b.lesson_id) ?? 0) + 1);
      });
      const enriched: Lesson[] = (lessonRows ?? []).map((l) => ({
        ...l,
        price: Number(l.price),
        booked: counts.get(l.id) ?? 0,
      }));
      setLessons(enriched);
      setLessonsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [step]);

  // Load admin-controlled active week
  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key", "active_week_start")
        .maybeSingle();
      if (cancelled) return;
      const raw = (data as { value?: string } | null)?.value;
      if (typeof raw === "string" && raw) {
        // raw is YYYY-MM-DD (a Sunday); construct local midnight
        const [y, m, d] = raw.split("-").map(Number);
        if (y && m && d) setActiveWeekStart(new Date(y, m - 1, d));
      }
    })();
    return () => { cancelled = true; };
  }, [step]);

  // Load saved participants when entering step 1
  useEffect(() => {
    if (step !== 1) return;
    loadSavedParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function startFresh() {
    await supabase.auth.signOut();
    setFullName(""); setEmail(""); setPhone(""); setPassword("");
    setRegistrations([]);
    setAgreed(false); setSignature("");
    setStep(0);
  }

  async function handleSignup() {
    const parsed = signupSchema.safeParse({ fullName, email, phone, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const redirectUrl = `${window.location.origin}/onboarding`;
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: parsed.data.fullName },
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ full_name: parsed.data.fullName, phone: parsed.data.phone, email: parsed.data.email })
        .eq("id", user.id);
      const { first, last } = splitName(parsed.data.fullName);
      await persistAccountHolder(user.id, {
        firstName: first,
        lastName: last,
        email: parsed.data.email,
        phone: parsed.data.phone,
      });
    }
    setLoading(false);
    setStep(1);
  }

  async function handleSignIn(loginEmail: string, loginPassword: string) {
    if (!loginEmail.trim() || !loginPassword) {
      toast.error("Enter your email and password");
      return;
    }
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    if (error || !authData.user) {
      setLoading(false);
      toast.error(error?.message ?? "Sign in failed");
      return;
    }
    setLoading(false);
    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  }

  // -------- Registration helpers --------
  function updateRegistration(id: string, patch: Partial<Registration> | ((r: Registration) => Partial<Registration>)) {
    // live invalid computed in render
    setRegistrations((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const p = typeof patch === "function" ? patch(r) : patch;
        return { ...r, ...p, player: { ...r.player, ...(p as Registration).player ?? {} } };
      }),
    );
  }

  function setRegPlayer(id: string, patch: Partial<Registration["player"]>) {
    // live invalid computed in render
    setRegistrations((rs) =>
      rs.map((r) => (r.id === id ? { ...r, player: { ...r.player, ...patch } } : r)),
    );
  }

  function toggleRegLesson(id: string, lessonId: string) {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    setRegistrations((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const exists = r.lessons.some((l) => l.lessonId === lessonId);
        const nextLessons = exists
          ? r.lessons.filter((l) => l.lessonId !== lessonId)
          : [
              ...r.lessons,
              {
                lessonId,
                lessonName: lesson.title,
                lessonDateTime: lesson.start_time,
                lessonEndTime: lesson.end_time,
                depositAmount: Number(lesson.price),
                depositStatus: "Pending" as const,
                cancellationStatus: "Active" as const,
                cancellationRequestedAt: null,
              },
            ];
        const participantSubtotal = nextLessons.reduce((s, l) => s + l.depositAmount, 0);
        return { ...r, lessons: nextLessons, participantSubtotal };
      }),
    );
  }

  function removeRegLesson(id: string, lessonId: string) {
    setRegistrations((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const nextLessons = r.lessons.filter((l) => l.lessonId !== lessonId);
        return { ...r, lessons: nextLessons, participantSubtotal: nextLessons.reduce((s, l) => s + l.depositAmount, 0) };
      }),
    );
  }

  function addAdult() {
    if (registrations.length >= 100) {
      toast.error("Maximum of 100 participants per registration.");
      return;
    }
    setRegistrations((rs) => [
      ...rs,
      {
        id: newId(),
        registrantType: "adult",
        isAccountHolder: false,
        player: { firstName: "", lastName: "", age: null, gender: null },
        lessons: [],
        participantSubtotal: 0,
      },
    ]);
  }

  function addChild() {
    if (registrations.length >= 100) {
      toast.error("Maximum of 100 participants per registration.");
      return;
    }
    setRegistrations((rs) => [
      ...rs,
      {
        id: newId(),
        registrantType: "junior",
        isAccountHolder: false,
        player: { firstName: "", lastName: "", age: null, gender: "" },
        lessons: [],
        participantSubtotal: 0,
      },
    ]);
  }

  function removeRegistration(id: string) {
    setRegistrations((rs) => rs.filter((r) => r.id !== id || r.isAccountHolder));
  }

  function regMissingFields(r: Registration): boolean {
    if (!r.isAccountHolder) {
      if (!r.player.firstName.trim() || !r.player.lastName.trim()) return true;
    }
    if (r.registrantType === "junior") {
      if (r.player.age === null || Number.isNaN(r.player.age) || r.player.age >= 18) return true;
      if (!r.player.gender) return true;
    }
    if (r.lessons.length === 0) return true;
    return false;
  }

  function validateRegistrations(): { ok: true } | { ok: false; firstInvalidId: string; msg: string } {
    for (const r of registrations) {
      if (r.registrantType === "junior" && r.player.age !== null && r.player.age >= 18) {
        return { ok: false, firstInvalidId: r.id, msg: "This child appears to be 18 or older. Please use Add an Adult instead." };
      }
      if (regMissingFields(r)) {
        return { ok: false, firstInvalidId: r.id, msg: "Please complete all required fields to continue." };
      }
    }
    return { ok: true };
  }

  async function handleContinueFromPlayers() {
    if (registrations.length === 0) return;
    setAttemptedContinue(true);
    const v = validateRegistrations();
    if (!v.ok) {
      setScrollToRegId(v.firstInvalidId);
      toast.error(v.msg);
      return;
    }
    // Persist any new (non-saved) participants now so admin sees them live
    await persistAdditionalParticipants();
    setStep(2);
  }

  async function handleWaiver() {
    if (!agreed) {
      toast.error("You must agree to the terms");
      return;
    }
    if (signature.trim().length < 2) {
      toast.error("Please type your full name as signature");
      return;
    }
    setLoading(true);
    try {
      await signWaiverFn({ data: { signature: signature.trim().slice(0, 100) } });
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign waiver");
    } finally {
      setLoading(false);
    }
  }

  function handleEditRegistration(id: string) {
    setScrollToRegId(id);
    setStep(1);
  }

  const accountHolder = {
    fullName,
    firstName: splitName(fullName).first,
    lastName: splitName(fullName).last,
    email,
    phone,
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">

        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <span className="text-2xl">🎾</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome to 2026 Tennis Lessons</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fairground Park · Eunice, Louisiana</p>
        </header>

        <Stepper step={step} />

        {step === 0 && (
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={startFresh}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Start fresh / use a different account
            </button>
          </div>
        )}

        <Card className="mt-6 border-border/60 p-5 shadow-sm sm:p-8">
          {step === 0 && (
            <SignupStep
              fullName={fullName} setFullName={setFullName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              password={password} setPassword={setPassword}
              onNext={handleSignup} onSignIn={handleSignIn} loading={loading}
            />
          )}
          {step === 1 && (
            <PlayersAndLessonsStep
              accountHolder={accountHolder}
              registrations={registrations}
              lessons={lessons}
              lessonsLoading={lessonsLoading}
              activeWeekStart={activeWeekStart}
              invalidRegIds={attemptedContinue ? new Set(registrations.filter(regMissingFields).map((r) => r.id)) : new Set<string>()}
              scrollToRegId={scrollToRegId}
              clearScroll={() => setScrollToRegId(null)}
              setRegPlayer={setRegPlayer}
              toggleRegLesson={toggleRegLesson}
              removeRegLesson={removeRegLesson}
              removeRegistration={removeRegistration}
              addAdult={addAdult}
              addChild={addChild}
              onBack={() => setStep(0)}
              onNext={handleContinueFromPlayers}
              onEditAccount={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <WaiverStep
              agreed={agreed} setAgreed={setAgreed}
              signature={signature} setSignature={setSignature}
              onBack={() => setStep(1)} onNext={handleWaiver} loading={loading}
            />
          )}
          {step === 3 && (
            <ReviewStep
              accountHolder={accountHolder}
              registrations={registrations}
              onBack={() => setStep(2)}
              onEdit={handleEditRegistration}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <PaymentStep
              registrations={registrations}
              accountHolder={accountHolder}
              onBack={() => setStep(3)}
              onPaid={persistBookings}
              onDone={() => navigate({ to: "/dashboard" })}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between gap-1 sm:gap-2">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                  ? "border-primary bg-background text-primary scale-110"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
            </div>
            <span className={`text-[10px] font-medium uppercase tracking-wide sm:text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SignupStep(props: {
  fullName: string; setFullName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  onNext: () => void; onSignIn: (email: string, password: string) => void; loading: boolean;
}) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  if (mode === "login") {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold">Welcome back</h2>
          <p className="text-sm text-muted-foreground">Sign in to register for lessons.</p>
        </div>
        <Field id="loginEmail" label="Email" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="you@example.com" />
        <Field id="loginPassword" label="Password" type="password" value={loginPassword} onChange={setLoginPassword} placeholder="Your password" />
        <Button onClick={() => props.onSignIn(loginEmail, loginPassword)} disabled={props.loading} className="w-full" size="lg">
          {props.loading ? "Signing in..." : "Log In"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <button type="button" onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">
            Create an account
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Create your account</h2>
        <p className="text-sm text-muted-foreground">You'll be the account holder. You can add more players in the next step.</p>
      </div>
      <Field id="fullName" label="Full Name" value={props.fullName} onChange={props.setFullName} placeholder="Jane Doe" />
      <Field id="email" label="Email" type="email" value={props.email} onChange={props.setEmail} placeholder="you@example.com" />
      <Field id="phone" label="Phone Number" type="tel" value={props.phone} onChange={props.setPhone} placeholder="(555) 123-4567" />
      <Field id="password" label="Password" type="password" value={props.password} onChange={props.setPassword} placeholder="At least 8 characters" />
      <Button onClick={props.onNext} disabled={props.loading} className="w-full" size="lg">
        {props.loading ? "Creating account..." : "Continue"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button type="button" onClick={() => setMode("login")} className="font-medium text-primary hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}

// ============== Step 1: Players & Lessons ==============

type AccountHolderInfo = { fullName: string; firstName: string; lastName: string; email: string; phone: string };

function PlayersAndLessonsStep(props: {
  accountHolder: AccountHolderInfo;
  registrations: Registration[];
  lessons: Lesson[];
  lessonsLoading: boolean;
  activeWeekStart: Date | null;
  invalidRegIds: Set<string>;
  scrollToRegId: string | null;
  clearScroll: () => void;
  setRegPlayer: (id: string, patch: Partial<Registration["player"]>) => void;
  toggleRegLesson: (id: string, lessonId: string) => void;
  removeRegLesson: (id: string, lessonId: string) => void;
  removeRegistration: (id: string) => void;
  addAdult: () => void;
  addChild: () => void;
  onBack: () => void;
  onNext: () => void;
  onEditAccount: () => void;
}) {
  const { accountHolder, registrations, lessons, activeWeekStart } = props;
  const accountHolderReg = registrations.find((r) => r.isAccountHolder);
  const others = registrations.filter((r) => !r.isAccountHolder);
  let adultCount = 1;
  let childCount = 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Players & Lessons</h2>
        <p className="text-sm text-muted-foreground">Each participant can pick one or more lessons. Add as many participants as you'd like.</p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
              Registering (Account Holder)
            </div>
            <div className="mt-1 font-semibold">
              {accountHolder.firstName} {accountHolder.lastName}
            </div>
            <div className="text-xs text-muted-foreground">Email: {accountHolder.email}</div>
            <div className="text-xs text-muted-foreground">Phone: {accountHolder.phone}</div>
          </div>
          <button
            type="button"
            onClick={props.onEditAccount}
            className="text-xs font-medium text-primary hover:underline"
          >
            Not you? Go back to edit
          </button>
        </div>
      </div>

      {accountHolderReg && (
        <ParticipantCard
          reg={accountHolderReg}
          header={`Adult 1 (You)`}
          lessons={lessons}
          lessonsLoading={props.lessonsLoading}
          activeWeekStart={activeWeekStart}
          showRemove={false}
          invalid={props.invalidRegIds.has(accountHolderReg.id)}
          scrollHere={props.scrollToRegId === accountHolderReg.id}
          onMounted={props.clearScroll}
          setRegPlayer={props.setRegPlayer}
          toggleRegLesson={props.toggleRegLesson}
          removeRegLesson={props.removeRegLesson}
          onRemove={() => {}}
          accountHolderName={`${accountHolder.firstName} ${accountHolder.lastName}`}
          hidePlayerFields
        />
      )}

      <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
        <div className="text-sm font-semibold">Add More Participants</div>
        <p className="text-xs text-muted-foreground">Up to {Math.max(0, 100 - registrations.length)} more.</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" onClick={props.addAdult} className="flex-1">
            <Plus className="mr-1 h-4 w-4" /> Add an Adult
          </Button>
          <Button type="button" variant="outline" onClick={props.addChild} className="flex-1">
            <Plus className="mr-1 h-4 w-4" /> Add a Child
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {others.map((r) => {
          const header =
            r.registrantType === "adult"
              ? `Adult ${++adultCount}`
              : `Child ${++childCount}`;
          return (
            <ParticipantCard
              key={r.id}
              reg={r}
              header={header}
              lessons={lessons}
              lessonsLoading={props.lessonsLoading}
              activeWeekStart={activeWeekStart}
              showRemove
              invalid={props.invalidRegIds.has(r.id)}
              scrollHere={props.scrollToRegId === r.id}
              onMounted={props.clearScroll}
              setRegPlayer={props.setRegPlayer}
              toggleRegLesson={props.toggleRegLesson}
              removeRegLesson={props.removeRegLesson}
              onRemove={() => props.removeRegistration(r.id)}
              accountHolderName={`${accountHolder.firstName} ${accountHolder.lastName}`}
            />
          );
        })}
      </div>

      <NavRow onBack={props.onBack} onNext={props.onNext} loading={false} nextLabel="Continue" />
    </div>
  );
}

function ParticipantCard(props: {
  reg: Registration;
  header: string;
  lessons: Lesson[];
  lessonsLoading: boolean;
  activeWeekStart: Date | null;
  showRemove: boolean;
  invalid: boolean;
  scrollHere: boolean;
  onMounted: () => void;
  setRegPlayer: (id: string, patch: Partial<Registration["player"]>) => void;
  toggleRegLesson: (id: string, lessonId: string) => void;
  removeRegLesson: (id: string, lessonId: string) => void;
  onRemove: () => void;
  accountHolderName: string;
  hidePlayerFields?: boolean;
}) {
  const { reg } = props;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (props.scrollHere && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      props.onMounted();
    }
  }, [props.scrollHere]);

  const ageWarning = reg.registrantType === "junior" && reg.player.age !== null && reg.player.age >= 18;

  function handleRemove() {
    setRemoving(true);
    setTimeout(() => props.onRemove(), 180);
  }

  const selectedIds = useMemo(() => new Set(reg.lessons.map((l) => l.lessonId)), [reg.lessons]);
  const firstName = reg.player.firstName.trim() || "Participant";

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border-2 bg-background p-4 transition-all duration-200 ${
        props.invalid ? "border-destructive" : "border-border"
      } ${removing ? "opacity-0 -translate-y-2" : "animate-in fade-in-50 slide-in-from-top-2"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold">{props.header}</div>
        {props.showRemove && (
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {!props.hidePlayerFields && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id={`fn-${reg.id}`}
              label="First Name *"
              value={reg.player.firstName}
              onChange={(v) => props.setRegPlayer(reg.id, { firstName: v })}
              placeholder="First"
            />
            <Field
              id={`ln-${reg.id}`}
              label="Last Name *"
              value={reg.player.lastName}
              onChange={(v) => props.setRegPlayer(reg.id, { lastName: v })}
              placeholder="Last"
            />
          </div>

          {reg.registrantType === "junior" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`age-${reg.id}`}>Age *</Label>
                  <Input
                    id={`age-${reg.id}`}
                    type="number"
                    min={1}
                    max={17}
                    value={reg.player.age ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      props.setRegPlayer(reg.id, { age: v === "" ? null : Number(v) });
                    }}
                    placeholder="e.g. 9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`g-${reg.id}`}>Gender *</Label>
                  <select
                    id={`g-${reg.id}`}
                    value={reg.player.gender ?? ""}
                    onChange={(e) => props.setRegPlayer(reg.id, { gender: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">Select</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              {ageWarning && (
                <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  This child appears to be 18 or older. Please use Add an Adult instead.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Parent/Guardian: <span className="font-medium text-foreground">{props.accountHolderName}</span>
              </p>
            </>
          )}
        </div>
      )}

      {/* Lesson selector — multi-select, locked to admin active week */}
      <div className="mt-3 space-y-2">
        <Label>Lessons * (select one or more)</Label>
        {props.lessonsLoading ? (
          <p className="text-xs text-muted-foreground">Loading lessons…</p>
        ) : props.lessons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No lessons available.</p>
        ) : (
          <LessonBrowser
            lessons={props.lessons}
            activeWeekStart={props.activeWeekStart}
            selectedIds={selectedIds}
            onToggle={(id) => props.toggleRegLesson(reg.id, id)}
          />
        )}

        {reg.lessons.length > 0 && (
          <SelectedLessonsSummary
            reg={reg}
            participantFirstName={firstName}
            onRemove={(lessonId) => props.removeRegLesson(reg.id, lessonId)}
          />
        )}
      </div>

      {props.invalid && (
        <p className="mt-3 text-xs font-medium text-destructive">
          Please complete all required fields to continue.
        </p>
      )}
    </div>
  );
}

function SelectedLessonsSummary({
  reg,
  participantFirstName,
  onRemove,
}: {
  reg: Registration;
  participantFirstName: string;
  onRemove: (lessonId: string) => void;
}) {
  const [showGoogle, setShowGoogle] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-green-600/40 bg-green-50/60 dark:bg-green-950/20 p-3 space-y-2">
      <div className="text-xs font-semibold text-green-800 dark:text-green-300">Selected Lessons:</div>
      <ul className="space-y-1.5">
        {reg.lessons.map((l) => {
          const d = new Date(l.lessonDateTime);
          const e = new Date(l.lessonEndTime);
          const dateStr = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
          const timeRange = `${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
          return (
            <li key={l.lessonId} className="flex items-start gap-2 text-xs">
              <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-700 dark:text-green-400" />
              <span className="flex-1">
                <span className="font-medium">{l.lessonName}</span>{" "}
                <span className="text-muted-foreground">· {dateStr} · {timeRange} · ${l.depositAmount.toFixed(0)}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(l.lessonId)}
                className="text-destructive hover:underline font-medium px-1"
                aria-label={`Remove ${l.lessonName}`}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground italic">+ Add more lessons above</p>
      <div className="flex items-center justify-between pt-1 border-t border-green-600/20">
        <span className="text-xs font-semibold">Deposit:</span>
        <span className="text-sm font-bold text-green-700 dark:text-green-400">${reg.participantSubtotal.toFixed(2)}</span>
      </div>

      <div className="pt-2 space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-green-600 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
          onClick={() => setShowGoogle((v) => !v)}
        >
          <Download className="mr-1 h-3.5 w-3.5" /> 📅 Add to Google Calendar
        </Button>
        {showGoogle && (
          <div className="rounded-md border border-border bg-background p-2 text-xs space-y-1">
            <div className="font-semibold">Add each lesson to Google Calendar:</div>
            {reg.lessons.map((l) => {
              const url = googleCalendarUrl(l, participantFirstName);
              const d = new Date(l.lessonDateTime);
              const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return (
                <a
                  key={l.lessonId}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  + {l.lessonName} – {dateStr}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Step 2: Waiver ==============

function WaiverStep(props: {
  agreed: boolean; setAgreed: (v: boolean) => void;
  signature: string; setSignature: (v: string) => void;
  onBack: () => void; onNext: () => void; loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Liability waiver</h2>
        <p className="text-sm text-muted-foreground">Please read carefully before signing.</p>
      </div>
      <div className="h-64 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {WAIVER_TEXT}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-secondary/40">
        <Checkbox id="agree" checked={props.agreed} onCheckedChange={(v) => props.setAgreed(v === true)} className="mt-0.5" />
        <span className="text-sm font-medium">I agree to the terms on behalf of all participants in this registration</span>
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="sig">Digital signature</Label>
        <Input
          id="sig"
          value={props.signature}
          onChange={(e) => props.setSignature(e.target.value)}
          placeholder="Type your full legal name"
          className="font-serif italic text-lg"
          maxLength={100}
        />
      </div>
      <NavRow onBack={props.onBack} onNext={props.onNext} loading={props.loading} />
    </div>
  );
}

// ============== Step 3: Review ==============

function ReviewStep(props: {
  accountHolder: AccountHolderInfo;
  registrations: Registration[];
  onBack: () => void;
  onEdit: (id: string) => void;
  onNext: () => void;
}) {
  const total = props.registrations.reduce((s, r) => s + r.participantSubtotal, 0);
  let adultCount = 0;
  let childCount = 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Review</h2>
        <p className="text-sm text-muted-foreground">Check each registration before paying.</p>
      </div>

      <div className="space-y-3">
        {props.registrations.map((r) => {
          if (r.registrantType === "adult") adultCount++;
          else childCount++;
          const header =
            r.registrantType === "adult"
              ? r.isAccountHolder ? "Adult 1 (You)" : `Adult ${adultCount}`
              : `Child ${childCount}`;
          return (
            <div key={r.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {header}
                </div>
                <button
                  type="button"
                  onClick={() => props.onEdit(r.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
              <div className="mt-1 text-base font-semibold">
                {r.player.firstName} {r.player.lastName}
              </div>
              {r.registrantType === "junior" && (
                <>
                  <div className="text-xs text-muted-foreground">
                    Age: {r.player.age ?? "—"} | Gender: {r.player.gender ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Parent/Guardian:{" "}
                    <span className="font-medium text-foreground">
                      {props.accountHolder.firstName} {props.accountHolder.lastName}
                    </span>
                  </div>
                </>
              )}
              <div className="mt-2 text-xs font-semibold text-muted-foreground">
                Lessons registered:
              </div>
              {r.lessons.length === 0 ? (
                <div className="text-xs text-destructive">No lessons selected.</div>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {r.lessons.map((l) => {
                    const d = new Date(l.lessonDateTime);
                    const e = new Date(l.lessonEndTime);
                    const dateStr = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                    const timeRange = `${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
                    return (
                      <li key={l.lessonId} className="text-xs">
                        • {l.lessonName} · {dateStr} · {timeRange} · ${l.depositAmount.toFixed(0)}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-2 text-sm font-semibold">Subtotal: ${r.participantSubtotal.toFixed(2)}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-primary/80">
            Total Deposit Due
          </div>
          <div className="text-2xl font-bold">${total.toFixed(2)}</div>
        </div>
      </div>

      <NavRow onBack={props.onBack} onNext={props.onNext} loading={false} nextLabel="Continue to payment" />
    </div>
  );
}

// ============== Step 4: Payment ==============

type PaymentMethodId = "zelle" | "venmo" | "applepay" | "cashapp";

type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  sublabel: string;
  initial: string;
  bg: string;
  text: string;
  border: string;
  hoverBorder: string;
};

const ALYSE_PHONE_DISPLAY = "337-945-2908";
const ALYSE_PHONE_RAW = "3379452908";
const ALYSE_NAME = "Alyse Cormier";
const ALYSE_EMAIL = "alysemcormier@gmail.com";
const VENMO_HANDLE = "@alysecormier";
const VENMO_URL = "https://venmo.com/u/alysecormier";
const CASHAPP_TAG = "$AlyseCormier";
const CASHAPP_URL = "https://cash.app/$AlyseCormier";

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "zelle",
    label: "Zelle",
    sublabel: `Send to: ${ALYSE_PHONE_DISPLAY}`,
    initial: "Z",
    bg: "bg-purple-600",
    text: "text-white",
    border: "border-border",
    hoverBorder: "hover:border-purple-600",
  },
  {
    id: "venmo",
    label: "Venmo",
    sublabel: `${VENMO_HANDLE} · ${ALYSE_PHONE_DISPLAY}`,
    initial: "V",
    bg: "bg-blue-500",
    text: "text-white",
    border: "border-border",
    hoverBorder: "hover:border-blue-500",
  },
  {
    id: "applepay",
    label: "Apple Pay",
    sublabel: `iMessage: ${ALYSE_PHONE_DISPLAY}`,
    initial: "Pay",
    bg: "bg-black",
    text: "text-white",
    border: "border-border",
    hoverBorder: "hover:border-black",
  },
  {
    id: "cashapp",
    label: "Cash App",
    sublabel: `${CASHAPP_TAG} · ${ALYSE_PHONE_DISPLAY}`,
    initial: "$",
    bg: "bg-green-500",
    text: "text-white",
    border: "border-border",
    hoverBorder: "hover:border-green-500",
  },
];

function SafetyBanner() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-100">
      <div className="font-medium">💡 All payments go to {ALYSE_NAME}.</div>
      <div className="mt-1 text-xs">
        Always confirm recipient name before sending.
        <br />
        Phone: {ALYSE_PHONE_DISPLAY} | Email: {ALYSE_EMAIL}
      </div>
    </div>
  );
}

function PaymentStep(props: {
  registrations: Registration[];
  accountHolder: AccountHolderInfo;
  onBack: () => void;
  onPaid: (paymentMethod: string, paymentReference: string | null) => Promise<boolean>;
  onDone: () => void;
}) {
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const navigate = useNavigate();

  const total = props.registrations.reduce((s, r) => s + r.participantSubtotal, 0);

  // Memo: "AccountHolder FullName, Participant1 FullName, … – earliestLessonDate"
  const memoInfo = useMemo(() => {
    const accountFull = `${props.accountHolder.firstName} ${props.accountHolder.lastName}`.trim();
    const participantNames = props.registrations.map((r) => {
      const first = r.player.firstName.trim();
      const last = r.player.lastName.trim();
      const full = `${first} ${last}`.trim();
      return r.isAccountHolder ? accountFull : full;
    }).filter(Boolean);
    // Ensure account-holder full name appears once at the front even if no
    // registration is flagged as the holder.
    const seen = new Set<string>();
    const ordered: string[] = [];
    if (accountFull) { ordered.push(accountFull); seen.add(accountFull.toLowerCase()); }
    for (const n of participantNames) {
      if (!seen.has(n.toLowerCase())) { ordered.push(n); seen.add(n.toLowerCase()); }
    }
    const allDates = props.registrations.flatMap((r) => r.lessons.map((l) => l.lessonDateTime)).filter(Boolean).sort();
    const earliest = allDates[0];
    const dateStr = earliest
      ? new Date(earliest).toLocaleDateString(undefined, { month: "long", day: "numeric" })
      : "";
    return { names: ordered, dateStr, memo: `${ordered.join(", ")} – ${dateStr}` };
  }, [props.registrations, props.accountHolder]);

  function downloadAllSessionIcs() {
    for (const r of props.registrations) {
      if (r.lessons.length === 0) continue;
      downloadIcs(r, r.player.firstName || props.accountHolder.firstName || "participant");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Payment</h2>
        <p className="text-sm text-muted-foreground">Send your total deposit using any method below.</p>
      </div>

      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-primary/80">
            Total Deposit Due
          </div>
          <div className="text-2xl font-bold">${total.toFixed(2)}</div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          For {props.registrations.length} registration{props.registrations.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="rounded-lg border-2 border-accent bg-accent/15 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-accent-foreground" />
          <div className="text-sm">
            <div className="font-semibold text-accent-foreground">⚠️ Cancellation Policy</div>
            <p className="mt-1 text-accent-foreground/90">
              Cancellations made less than 24 hours before a scheduled lesson will incur a 50% fee. Cancellations apply per individual booking.
            </p>
          </div>
        </div>
      </div>

      {paid ? (
        <div className="rounded-lg border-2 border-green-600/40 bg-green-50 p-8 text-center dark:bg-green-950/20">
          <div className="mx-auto text-5xl">🎾</div>
          <div className="mt-3 text-2xl font-bold">You're Registered!</div>
          <p className="mt-3 text-sm text-foreground">
            Thank you, <span className="font-semibold">{props.accountHolder.fullName || "friend"}</span>. Your lesson registration has been received. A confirmation email has been sent to{" "}
            <span className="font-semibold">{props.accountHolder.email}</span>.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Your deposit is pending verification. You will receive a second email once confirmed.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              onClick={() => navigate({ to: "/dashboard" })}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              View My Lessons
            </Button>
            <Button onClick={downloadAllSessionIcs} variant="outline">
              <Download className="mr-1 h-4 w-4" /> Add Lessons to Calendar
            </Button>
          </div>
        </div>
      ) : selectedMethod ? (
        <>
          <PaymentConfirm
            method={selectedMethod}
            depositAmount={total}
            memo={memoInfo.memo}
            memoNames={memoInfo.names}
            memoDate={memoInfo.dateStr}
            saving={saving}
            onConfirm={async (transactionId) => {
              setSaveError(null);
              setSaving(true);
              const ok = await props.onPaid(selectedMethod!.label, transactionId);
              setSaving(false);
              if (!ok) {
                setSaveError("Something went wrong saving your registration. Please try again or contact alysemcormier@gmail.com");
                return;
              }
              setPaid(true);
            }}
            onBack={() => setSelectedMethod(null)}
          />
          {saveError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {saveError}
            </div>
          )}
        </>
      ) : (
        <PaymentMethodPicker onSelect={setSelectedMethod} />
      )}

      {!paid && !selectedMethod && (
        <Button onClick={props.onBack} variant="ghost" className="w-full">
          ← Back to review
        </Button>
      )}
    </div>
  );
}


function PaymentMethodPicker({ onSelect }: { onSelect: (m: PaymentMethod) => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="text-xl font-bold">Choose Your Payment Method</h3>
        <p className="mt-1 text-sm text-muted-foreground">Select your preferred way to pay below</p>
      </div>
      <SafetyBanner />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className={`group flex flex-col items-center gap-3 rounded-xl border-2 ${m.border} ${m.hoverBorder} bg-background p-5 text-center transition-all hover:shadow-md`}
          >
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${m.bg} ${m.text} text-xl font-bold shadow`}
            >
              {m.initial}
            </div>
            <div>
              <div className="text-base font-semibold">{m.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{m.sublabel}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MemoBlock({ names, date }: { names: string[]; date: string }) {
  return (
    <div className="rounded-md bg-secondary/40 border border-border p-2 text-xs">
      <div className="font-semibold">In the memo write:</div>
      <div className="font-mono mt-0.5">{names.join(", ")} – {date}</div>
    </div>
  );
}

function PaymentConfirm({
  method,
  depositAmount,
  memo: _memo,
  memoNames,
  memoDate,
  onConfirm,
  onBack,
  saving = false,
}: {
  method: PaymentMethod;
  depositAmount: number;
  memo: string;
  memoNames: string[];
  memoDate: string;
  onConfirm: (transactionId: string) => void;
  onBack: () => void;
  saving?: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const amount = depositAmount.toFixed(2);
  let body: React.ReactNode = null;

  if (method.id === "zelle") {
    body = (
      <>
        <div className="text-sm font-semibold">To pay via Zelle:</div>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Open your banking app and go to Zelle</li>
          <li>Search for: <span className="font-mono font-semibold">{ALYSE_PHONE_RAW}</span> or <span className="font-mono font-semibold">{ALYSE_EMAIL}</span></li>
          <li>Confirm recipient shows <span className="font-semibold">{ALYSE_NAME}</span> before sending</li>
          <li>Send <span className="font-semibold">${amount}</span></li>
        </ol>
        <MemoBlock names={memoNames} date={memoDate} />
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          📱 <span className="font-semibold">Zelle:</span> {ALYSE_PHONE_DISPLAY} / {ALYSE_EMAIL}<br />
          <span className="font-semibold">Recipient:</span> {ALYSE_NAME}
        </div>
      </>
    );
  } else if (method.id === "applepay") {
    body = (
      <>
        <div className="text-sm font-semibold">To pay via Apple Pay:</div>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Open Messages on your iPhone</li>
          <li>Start a new message to: <span className="font-mono font-semibold">{ALYSE_PHONE_RAW}</span></li>
          <li>Tap the Apple Pay icon inside the message</li>
          <li>Confirm recipient shows <span className="font-semibold">{ALYSE_NAME}</span> before sending</li>
          <li>Send <span className="font-semibold">${amount}</span></li>
        </ol>
        <MemoBlock names={memoNames} date={memoDate} />
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          📱 <span className="font-semibold">Apple Pay:</span> {ALYSE_PHONE_DISPLAY}<br />
          <span className="font-semibold">Recipient:</span> {ALYSE_NAME}
        </div>
      </>
    );
  } else if (method.id === "venmo") {
    body = (
      <>
        <p className="text-sm">Venmo is opening in a new tab.</p>
        <div className="text-sm">
          <div className="font-semibold">Find the account by:</div>
          <ul className="ml-5 mt-1 list-disc space-y-0.5">
            <li>Link: <span className="font-mono">{VENMO_HANDLE}</span></li>
            <li>Phone: <span className="font-mono">{ALYSE_PHONE_DISPLAY}</span></li>
          </ul>
        </div>
        <div className="text-sm">
          Send <span className="font-semibold">${amount}</span> to <span className="font-semibold">{ALYSE_NAME}</span>
        </div>
        <MemoBlock names={memoNames} date={memoDate} />
        <Button asChild variant="outline" size="sm">
          <a href={VENMO_URL} target="_blank" rel="noopener noreferrer">Open Venmo ↗</a>
        </Button>
      </>
    );
  } else if (method.id === "cashapp") {
    body = (
      <>
        <p className="text-sm">Cash App is opening in a new tab.</p>
        <div className="text-sm">
          <div className="font-semibold">Find the account by:</div>
          <ul className="ml-5 mt-1 list-disc space-y-0.5">
            <li>Cashtag: <span className="font-mono">{CASHAPP_TAG}</span></li>
            <li>Phone: <span className="font-mono">{ALYSE_PHONE_DISPLAY}</span></li>
          </ul>
        </div>
        <div className="text-sm">
          Send <span className="font-semibold">${amount}</span> to <span className="font-semibold">{ALYSE_NAME}</span>
        </div>
        <MemoBlock names={memoNames} date={memoDate} />
        <Button asChild variant="outline" size="sm">
          <a href={CASHAPP_URL} target="_blank" rel="noopener noreferrer">Open Cash App ↗</a>
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-border bg-secondary/20 p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full ${method.bg} ${method.text} text-lg font-bold`}
        >
          {method.initial}
        </div>
        <div>
          <div className="text-base font-semibold">You selected {method.label}.</div>
          <div className="text-xs text-muted-foreground">Pay {ALYSE_NAME} · {ALYSE_PHONE_DISPLAY}</div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        {body}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-4 cursor-pointer hover:bg-accent/30">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-5 w-5 cursor-pointer"
        />
        <div className="text-sm">
          <div className="font-semibold">I've sent the payment of ${amount} via {method.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Coach Alyse will verify the payment in {method.label} and confirm your spot. You'll get a confirmation once approved.
          </div>
        </div>
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" onClick={onBack} className="flex-1 bg-gray-100 hover:bg-gray-200">
          Go Back
        </Button>
        <Button
          onClick={() => onConfirm("")}
          disabled={saving || !confirmed}
          className="flex-1 bg-green-600 text-white hover:bg-green-700"
        >
          {saving ? "Saving…" : "I've Paid ✓"}
        </Button>
      </div>
    </div>
  );
}

// ============== Shared ==============

function Field({
  id, label, value, onChange, placeholder, type = "text", inputMode,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type={type} value={value} inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      />
    </div>
  );
}

function NavRow({ onBack, onNext, loading, nextLabel, disabled }: { onBack: () => void; onNext: () => void; loading: boolean; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button variant="outline" onClick={onBack} disabled={loading} className="flex-1">Back</Button>
      <Button onClick={onNext} disabled={loading || disabled} className="flex-1">
        {loading ? "Saving..." : (nextLabel ?? "Continue")}
      </Button>
    </div>
  );
}

// ============== Lesson Browser (Week + Calendar) ==============

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `Week of ${s} – ${e}`;
}

function LessonBrowser(props: {
  lessons: Lesson[];
  activeWeekStart: Date | null;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { lessons, activeWeekStart, selectedIds, onToggle } = props;
  const [view, setView] = useState<"week" | "calendar">("week");

  // Effective active week: admin-set, else current week containing earliest lesson
  const effectiveWeek = useMemo(() => {
    if (activeWeekStart) return activeWeekStart;
    if (lessons.length > 0) return startOfWeek(new Date(lessons[0].start_time));
    return startOfWeek(new Date());
  }, [activeWeekStart, lessons]);

  const weekEnd = useMemo(() => addDays(effectiveWeek, 7), [effectiveWeek]);

  const weekLessons = useMemo(
    () =>
      lessons
        .filter((l) => {
          const t = new Date(l.start_time).getTime();
          return t >= effectiveWeek.getTime() && t < weekEnd.getTime();
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [lessons, effectiveWeek, weekEnd],
  );

  const weekRangeLabel = useMemo(() => {
    const end = addDays(effectiveWeek, 6);
    const s = effectiveWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const e = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${s} – ${e}`;
  }, [effectiveWeek]);

  // Calendar view month state
  const [calMonth, setCalMonth] = useState<Date>(() => new Date(effectiveWeek.getFullYear(), effectiveWeek.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  useEffect(() => {
    setCalMonth(new Date(effectiveWeek.getFullYear(), effectiveWeek.getMonth(), 1));
    setSelectedDay(null);
  }, [effectiveWeek]);

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="inline-flex rounded-md border border-border bg-secondary/30 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setView("week")}
          className={`px-2.5 py-1 rounded ${view === "week" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          ← Week View →
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          className={`px-2.5 py-1 rounded ${view === "calendar" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          📅 Calendar
        </button>
      </div>

      {/* Active week label (read-only) */}
      <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs font-medium text-foreground text-center">
        Lessons available for the week of {weekRangeLabel}
      </div>

      {view === "week" ? (
        <WeekView weekLessons={weekLessons} selectedIds={selectedIds} onToggle={onToggle} />
      ) : (
        <CalendarView
          lessons={lessons}
          activeWeekStart={effectiveWeek}
          weekEnd={weekEnd}
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function LessonCard(props: { lesson: Lesson; selected: boolean; onToggle: (id: string) => void }) {
  const l = props.lesson;
  const isFull = l.booked >= l.capacity;
  const d = new Date(l.start_time);
  const e = new Date(l.end_time);
  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeRange = `${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return (
    <button
      type="button"
      disabled={isFull && !props.selected}
      onClick={() => props.onToggle(l.id)}
      className={`relative text-left rounded-lg border-2 p-3 transition-all ${
        props.selected
          ? "border-green-600 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-600/30"
          : isFull
          ? "border-border bg-muted/40 opacity-60 cursor-not-allowed"
          : "border-border bg-background hover:border-primary/60 hover:bg-secondary/40"
      }`}
    >
      {props.selected && (
        <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="text-sm font-semibold pr-6">{l.title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{day} · {date}</div>
      <div className="text-xs text-muted-foreground">{timeRange}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">${Number(l.price).toFixed(0)}{isFull ? " · FULL" : ""}</div>
    </button>
  );
}

function WeekView(props: {
  weekLessons: Lesson[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (props.weekLessons.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No lessons available this week.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {props.weekLessons.map((l) => (
        <LessonCard key={l.id} lesson={l} selected={props.selectedIds.has(l.id)} onToggle={props.onToggle} />
      ))}
    </div>
  );
}

function CalendarView(props: {
  lessons: Lesson[];
  activeWeekStart: Date;
  weekEnd: Date;
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { lessons, activeWeekStart, weekEnd, calMonth, setCalMonth, selectedDay, setSelectedDay } = props;

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const d = new Date(l.start_time);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [lessons]);

  const monthLabel = calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const gridStart = addDays(firstDay, -firstDay.getDay());

  function shiftMonth(delta: number) {
    setSelectedDay(null);
    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));
  }

  function dayLessons(d: Date): Lesson[] {
    return lessonsByDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];
  }

  function inActiveWeek(d: Date): boolean {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return t >= activeWeekStart.getTime() && t < weekEnd.getTime();
  }

  function handleDayClick(d: Date) {
    if (!inActiveWeek(d)) return;
    const lns = dayLessons(d);
    if (lns.length === 0) return;
    setSelectedDay(d);
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

  const selectedLessons = selectedDay ? dayLessons(selectedDay) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1.5">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="px-2 py-1 text-xs font-medium hover:bg-background rounded"
        >
          ←
        </button>
        <div className="text-xs font-medium">{monthLabel}</div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="px-2 py-1 text-xs font-medium hover:bg-background rounded"
        >
          →
        </button>
      </div>

      <div className="rounded-md border border-border p-2">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
          {weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === calMonth.getMonth();
            const lns = dayLessons(d);
            const inWeek = inActiveWeek(d);
            const hasLessons = lns.length > 0 && inMonth && inWeek;
            const isSelected = selectedDay && sameDay(d, selectedDay);
            return (
              <button
                key={i}
                type="button"
                disabled={!hasLessons}
                onClick={() => handleDayClick(d)}
                className={`relative aspect-square flex items-center justify-center text-xs rounded transition-colors ${
                  !inMonth ? "text-muted-foreground/30" :
                  !hasLessons ? "text-muted-foreground/40 cursor-not-allowed" :
                  isSelected ? "bg-green-600 text-white font-semibold" :
                  "text-foreground hover:bg-secondary"
                }`}
              >
                {d.getDate()}
                {hasLessons && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-green-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="animate-in slide-in-from-top-2 fade-in-50 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Lessons on {selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedLessons.map((l) => (
              <LessonCard key={l.id} lesson={l} selected={props.selectedIds.has(l.id)} onToggle={props.onToggle} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== ICS Calendar download helpers ==============

const LESSON_LOCATION = "Fairground Park, Eunice, Louisiana";
const LESSON_CONTACT_EMAIL = "alysemcormier@gmail.com";
const LESSON_CONTACT_PHONE = "337-945-2908";

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
function escIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildIcs(reg: Registration, firstName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//2026 Tennis Lessons//EN",
    "CALSCALE:GREGORIAN",
  ];
  const dtstamp = toIcsUtc(new Date().toISOString());
  const description = escIcs(
    `Tennis lesson at ${LESSON_LOCATION}.\n\n` +
    `Cancellation Policy: Cancellations must be made more than 24 hours in advance. Late cancellations or no-shows forfeit the deposit as a 50% fee.\n\n` +
    `Questions? Email: ${LESSON_CONTACT_EMAIL}\nPhone: ${LESSON_CONTACT_PHONE}`,
  );
  for (const l of reg.lessons) {
    const uid = `${l.lessonId}-${reg.id}@2026tennislessons`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${toIcsUtc(l.lessonDateTime)}`,
      `DTEND:${toIcsUtc(l.lessonEndTime)}`,
      `SUMMARY:${escIcs(`🎾 Tennis Lesson – ${firstName} – 2026 Tennis Lessons`)}`,
      `LOCATION:${escIcs(LESSON_LOCATION)}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT48H",
      "DESCRIPTION:Your tennis lesson is in 48 hours. Cancel before the 24-hour cutoff to avoid a fee.",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT24H",
      "DESCRIPTION:Cancellation window is now closed for tomorrow's lesson. See you at Fairground Park!",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadIcs(reg: Registration, firstName: string) {
  const ics = buildIcs(reg, firstName);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tennis-lessons-${firstName.toLowerCase().replace(/\s+/g, "-") || "participant"}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function googleCalendarUrl(l: SelectedLesson, firstName: string): string {
  const fmt = (iso: string) => toIcsUtc(iso);
  const text = `🎾 Tennis Lesson – ${firstName} – 2026 Tennis Lessons`;
  const details =
    `Tennis lesson at ${LESSON_LOCATION}.\n\n` +
    `Cancellation Policy: Cancellations must be made more than 24 hours in advance. Late cancellations or no-shows forfeit the deposit as a 50% fee.\n\n` +
    `Questions? Email: ${LESSON_CONTACT_EMAIL}\nPhone: ${LESSON_CONTACT_PHONE}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${fmt(l.lessonDateTime)}/${fmt(l.lessonEndTime)}`,
    details,
    location: LESSON_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

