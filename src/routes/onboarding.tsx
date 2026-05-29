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
import { CheckCircle2, AlertTriangle, CalendarDays, DollarSign, Plus, X, Pencil, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { signWaiver } from "@/lib/waiver.functions";

export const Route = createFileRoute("/onboarding")({
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

type Registration = {
  id: string;
  registrantType: RegistrantType;
  isAccountHolder: boolean;
  player: {
    firstName: string;
    lastName: string;
    age: number | null;
    gender: string | null;
  };
  lessonId: string;
  lessonDateTime: string;
  depositAmount: number;
  depositStatus: "Pending";
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
  const signWaiverFn = useServerFn(signWaiver);
  const [step, setStep] = useState(0);
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
        lessonId: "",
        lessonDateTime: "",
        depositAmount: 0,
        depositStatus: "Pending",
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
          .from("bookings")
          .select("lesson_id")
          .eq("payment_status", "paid")
          .eq("cancellation_status", "active"),
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
    const userId = authData.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, email, waiver_signed")
      .eq("id", userId)
      .maybeSingle();
    setLoading(false);
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setEmail(profile.email ?? loginEmail.trim());
    }
    toast.success("Signed in. Let's pick lessons.");
    setStep(profile?.waiver_signed ? 1 : 1);
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

  function setRegLesson(id: string, lessonId: string) {
    // live invalid computed in render
    const lesson = lessons.find((l) => l.id === lessonId);
    setRegistrations((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              lessonId,
              lessonDateTime: lesson ? lesson.start_time : "",
              depositAmount: lesson ? Number(lesson.price) : 0,
            }
          : r,
      ),
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
        lessonId: "",
        lessonDateTime: "",
        depositAmount: 0,
        depositStatus: "Pending",
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
        lessonId: "",
        lessonDateTime: "",
        depositAmount: 0,
        depositStatus: "Pending",
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
    if (!r.lessonId) return true;
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

  function handleContinueFromPlayers() {
    if (registrations.length === 0) return;
    setAttemptedContinue(true);
    const v = validateRegistrations();
    if (!v.ok) {
      setScrollToRegId(v.firstInvalidId);
      toast.error(v.msg);
      return;
    }
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
              invalidRegIds={attemptedContinue ? new Set(registrations.filter(regMissingFields).map((r) => r.id)) : new Set<string>()}
              scrollToRegId={scrollToRegId}
              clearScroll={() => setScrollToRegId(null)}
              setRegPlayer={setRegPlayer}
              setRegLesson={setRegLesson}
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
              onDone={() => navigate({ to: "/" })}
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
  invalidRegIds: Set<string>;
  scrollToRegId: string | null;
  clearScroll: () => void;
  setRegPlayer: (id: string, patch: Partial<Registration["player"]>) => void;
  setRegLesson: (id: string, lessonId: string) => void;
  removeRegistration: (id: string) => void;
  addAdult: () => void;
  addChild: () => void;
  onBack: () => void;
  onNext: () => void;
  onEditAccount: () => void;
}) {
  const { accountHolder, registrations, lessons } = props;
  const accountHolderReg = registrations.find((r) => r.isAccountHolder);
  const others = registrations.filter((r) => !r.isAccountHolder);
  let adultCount = 1; // account holder is Adult 1
  let childCount = 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Players & Lessons</h2>
        <p className="text-sm text-muted-foreground">Each participant picks their own lesson. Add as many as you'd like.</p>
      </div>

      {/* Account holder summary */}
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

      {/* Account holder's lesson selector */}
      {accountHolderReg && (
        <ParticipantCard
          reg={accountHolderReg}
          header={`Adult 1 (You)`}
          lessons={lessons}
          lessonsLoading={props.lessonsLoading}
          showRemove={false}
          invalid={props.invalidRegIds.has(accountHolderReg.id)}
          scrollHere={props.scrollToRegId === accountHolderReg.id}
          onMounted={props.clearScroll}
          setRegPlayer={props.setRegPlayer}
          setRegLesson={props.setRegLesson}
          onRemove={() => {}}
          accountHolderName={`${accountHolder.firstName} ${accountHolder.lastName}`}
          hidePlayerFields
        />
      )}

      {/* Add More Participants */}
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

      {/* Other participant cards */}
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
              showRemove
              invalid={props.invalidRegIds.has(r.id)}
              scrollHere={props.scrollToRegId === r.id}
              onMounted={props.clearScroll}
              setRegPlayer={props.setRegPlayer}
              setRegLesson={props.setRegLesson}
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
  showRemove: boolean;
  invalid: boolean;
  scrollHere: boolean;
  onMounted: () => void;
  setRegPlayer: (id: string, patch: Partial<Registration["player"]>) => void;
  setRegLesson: (id: string, lessonId: string) => void;
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
      {/* Lesson selector — card/tile picker */}
      <div className="mt-3 space-y-2">
        <Label>Lesson *</Label>
        {props.lessonsLoading ? (
          <p className="text-xs text-muted-foreground">Loading lessons…</p>
        ) : props.lessons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No lessons available.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {props.lessons.map((l) => {
              const isFull = l.booked >= l.capacity;
              const isSelected = reg.lessonId === l.id;
              const d = new Date(l.start_time);
              const e = new Date(l.end_time);
              const day = d.toLocaleDateString(undefined, { weekday: "long" });
              const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
              const timeRange = `${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={isFull && !isSelected}
                  onClick={() => props.setRegLesson(reg.id, l.id)}
                  className={`relative text-left rounded-lg border-2 p-3 transition-all ${
                    isSelected
                      ? "border-green-600 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-600/30"
                      : isFull
                      ? "border-border bg-muted/40 opacity-60 cursor-not-allowed"
                      : "border-border bg-background hover:border-primary/60 hover:bg-secondary/40"
                  }`}
                >
                  {isSelected && (
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
            })}
          </div>
        )}
        {reg.lessonId && (
          <p className="text-[11px] text-muted-foreground">
            Deposit: <span className="font-semibold text-foreground">${reg.depositAmount.toFixed(2)}</span>
          </p>
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
  const total = props.registrations.reduce((s, r) => s + r.depositAmount, 0);
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
          const lessonLabel = r.lessonDateTime
            ? new Date(r.lessonDateTime).toLocaleString(undefined, {
                weekday: "short", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit",
              })
            : "—";
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
              <div className="mt-1 text-xs text-muted-foreground">Lesson: {lessonLabel}</div>
              <div className="mt-1 text-sm font-semibold">Deposit: ${r.depositAmount.toFixed(2)}</div>
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
  onDone: () => void;
}) {
  const [paid, setPaid] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  const total = props.registrations.reduce((s, r) => s + r.depositAmount, 0);

  // Memo: "First1, First2, First3 – earliestLessonDate"
  const memoInfo = useMemo(() => {
    const names = props.registrations.map((r) => r.player.firstName.trim()).filter(Boolean);
    const earliest = props.registrations
      .map((r) => r.lessonDateTime)
      .filter(Boolean)
      .sort()[0];
    const dateStr = earliest
      ? new Date(earliest).toLocaleDateString(undefined, { month: "long", day: "numeric" })
      : "";
    return { names, dateStr, memo: `${names.join(", ")} – ${dateStr}` };
  }, [props.registrations]);

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
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-8 text-center">
          <div className="mx-auto text-5xl">🎾</div>
          <div className="mt-3 text-xl font-bold">You're all set!</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome to 2026 Tennis Lessons. We'll be in touch shortly with next steps.
          </p>
          <Button onClick={props.onDone} className="mt-5">Done</Button>
        </div>
      ) : selectedMethod ? (
        <PaymentConfirm
          method={selectedMethod}
          depositAmount={total}
          memo={memoInfo.memo}
          memoNames={memoInfo.names}
          memoDate={memoInfo.dateStr}
          onConfirm={() => setPaid(true)}
          onBack={() => setSelectedMethod(null)}
        />
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
  memo,
  memoNames,
  memoDate,
  onConfirm,
  onBack,
}: {
  method: PaymentMethod;
  depositAmount: number;
  memo: string;
  memoNames: string[];
  memoDate: string;
  onConfirm: () => void;
  onBack: () => void;
}) {
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" onClick={onBack} className="flex-1 bg-gray-100 hover:bg-gray-200">
          Go Back
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1 bg-green-600 text-white hover:bg-green-700"
        >
          I've Paid ✓
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
