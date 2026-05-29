import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";
import { CheckCircle2, AlertTriangle, Trash2, CalendarDays, Users, DollarSign, LayoutGrid, CalendarRange } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
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

type Student = { id: string; name: string; age?: number | null };
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
type LessonCartItem = {
  lessonId: string;
  studentId: string | null;
  stayForMatchPlay?: boolean;
};

type RegistrationType = "adult" | "junior";

type AdultInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  skillLevel: string;
};

type JuniorPlayerInfo = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  skillLevel: string;
};

type GuardianInfo = {
  firstName: string;
  lastName: string;
  relationship: string;
  email: string;
  phone: string;
  emergencyPhone: string;
  authorized: boolean;
};

const SKILL_LEVELS = ["Beginner", "Advanced Beginner", "Intermediate", "Advanced", "Competitive"];
const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Other"];

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(7, "Phone is too short").max(20),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const STEPS = ["Sign Up", "Player Info", "Waiver", "Select Lesson", "Payment"] as const;

const WAIVER_TEXT = `LIABILITY WAIVER AND RELEASE OF CLAIMS

In consideration of being permitted to participate in tennis lessons, clinics, programs, and related activities ("Activities") offered by Ace Tennis Academy ("Academy"), I, the undersigned participant (or parent/legal guardian of the participant), acknowledge and agree to the following:

1. ASSUMPTION OF RISK. I understand that tennis and related athletic activities involve inherent risks, including but not limited to slips, falls, collisions, sprains, fractures, heat-related illness, and other injuries. I voluntarily assume all such risks.

2. RELEASE OF LIABILITY. I hereby release, waive, and discharge the Academy, its coaches, employees, agents, and affiliates from any and all claims, demands, or causes of action arising out of or related to any loss, damage, or injury sustained during the Activities, except in cases of gross negligence or willful misconduct.

3. MEDICAL TREATMENT. I authorize the Academy to seek emergency medical treatment for the participant if necessary, and I agree to be responsible for any costs incurred.

4. PHOTO/VIDEO RELEASE. I consent to the use of photographs or video taken during Activities for promotional purposes, unless I notify the Academy in writing otherwise.

5. FITNESS REPRESENTATION. I represent that the participant is in good physical condition and has no medical conditions that would prevent safe participation.

6. CANCELLATION POLICY. Cancellations made less than 24 hours before a scheduled lesson will incur a 50% fee. No-shows will be charged the full lesson price.

7. GOVERNING LAW. This waiver shall be governed by the laws of the state in which the Academy operates.

I have read this waiver in its entirety, fully understand its terms, and sign it freely and voluntarily. By typing my name below as a digital signature, I agree this constitutes a legally binding electronic signature.`;

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const signWaiverFn = useServerFn(signWaiver);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // step 1 (account)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // step 2 (player info)
  const [registrationType, setRegistrationType] = useState<RegistrationType>("adult");
  const [adultInfo, setAdultInfo] = useState<AdultInfo>({
    firstName: "", lastName: "", email: "", phone: "", skillLevel: "",
  });
  const [juniorPlayer, setJuniorPlayer] = useState<JuniorPlayerInfo>({
    firstName: "", lastName: "", dateOfBirth: "", skillLevel: "",
  });
  const [guardian, setGuardian] = useState<GuardianInfo>({
    firstName: "", lastName: "", relationship: "", email: "", phone: "", emergencyPhone: "", authorized: false,
  });
  const [students, setStudents] = useState<Student[]>([]);

  // step 3
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");

  // step 4 (lesson selection)
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonCart, setLessonCart] = useState<LessonCartItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [savedCardLast4, setSavedCardLast4] = useState<string | null>(null);
  const [returningClient, setReturningClient] = useState(false);

  async function startFresh() {
    await supabase.auth.signOut();
    setFullName(""); setEmail(""); setPhone(""); setPassword("");
    setRegistrationType("adult");
    setAdultInfo({ firstName: "", lastName: "", email: "", phone: "", skillLevel: "" });
    setJuniorPlayer({ firstName: "", lastName: "", dateOfBirth: "", skillLevel: "" });
    setGuardian({ firstName: "", lastName: "", relationship: "", email: "", phone: "", emergencyPhone: "", authorized: false });
    setStudents([]);
    setSelectedStudentId(null);
    setSavedCardLast4(null);
    setReturningClient(false);
    setLessonCart([]);
    setStep(0);
  }

  function addLessonToCart(lessonId: string, studentId: string | null, stayForMatchPlay?: boolean) {
    if (lessonCart.length >= 100) {
      toast.error("You can only add up to 100 registrations at a time.");
      return;
    }
    const alreadyAdded = lessonCart.some(
      (item) => item.lessonId === lessonId && item.studentId === studentId
    );
    if (alreadyAdded) {
      toast.error("This player is already added for this lesson.");
      return;
    }
    setLessonCart((cart) => [...cart, { lessonId, studentId, stayForMatchPlay: stayForMatchPlay === true }]);
    toast.success("Added to registration cart");
  }

  function removeLessonFromCart(index: number) {
    setLessonCart((cart) => cart.filter((_, i) => i !== index));
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
    // Prefill adult contact fields for convenience
    setAdultInfo((a) => ({
      ...a,
      email: a.email || parsed.data.email,
      phone: a.phone || parsed.data.phone,
    }));
    setGuardian((g) => ({
      ...g,
      email: g.email || parsed.data.email,
      phone: g.phone || parsed.data.phone,
    }));
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
    const [{ data: profile }, { data: studentRows }] = await Promise.all([
      supabase.from("profiles").select("waiver_signed, full_name, phone, email, saved_card_last4, stripe_customer_id").eq("id", userId).maybeSingle(),
      supabase.from("students").select("id, name, age").eq("parent_id", userId),
    ]);
    setLoading(false);
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setEmail(profile.email ?? loginEmail.trim());
      if (profile.saved_card_last4 && profile.stripe_customer_id) {
        setSavedCardLast4(profile.saved_card_last4);
      }
    }
    if (studentRows && studentRows.length > 0) {
      setStudents(studentRows);
      setSelectedStudentId(studentRows[0].id);
      setRegistrationType("junior");
    }
    if (profile?.waiver_signed) {
      toast.success("Welcome back! Pick your next lesson.");
      setReturningClient(true);
      setStep(3);
    } else {
      toast.success("Signed in. Let's finish setting you up.");
      setStep(1);
    }
  }

  async function handlePlayerInfo() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Session expired");
      return;
    }

    if (registrationType === "junior") {
      if (!juniorPlayer.firstName.trim() || !juniorPlayer.lastName.trim()) {
        toast.error("Player first and last name are required");
        return;
      }
      if (!juniorPlayer.dateOfBirth) {
        toast.error("Date of birth is required");
        return;
      }
      const age = calcAge(juniorPlayer.dateOfBirth);
      if (age !== null && age >= 18) {
        toast.error("This player appears to be 18 or older. Please select 'Adult Player' instead.");
        return;
      }
      if (!guardian.firstName.trim() || !guardian.lastName.trim() || !guardian.email.trim() || !guardian.phone.trim() || !guardian.relationship) {
        toast.error("Please complete all required parent/guardian fields");
        return;
      }
      if (!guardian.authorized) {
        toast.error("Please confirm you are the parent or legal guardian to continue.");
        return;
      }
      setLoading(true);
      const fullChildName = `${juniorPlayer.firstName.trim()} ${juniorPlayer.lastName.trim()}`.slice(0, 100);
      const { data: inserted, error } = await supabase
        .from("students")
        .insert([{
          parent_id: user.id,
          name: fullChildName,
          age: age ?? null,
        }])
        .select("id, name, age");
      if (error) {
        setLoading(false);
        toast.error(error.message);
        return;
      }
      const guardianFull = `${guardian.firstName.trim()} ${guardian.lastName.trim()}`.slice(0, 100);
      await supabase
        .from("profiles")
        .update({
          full_name: guardianFull,
          email: guardian.email.trim().slice(0, 255),
          phone: guardian.phone.trim().slice(0, 20),
        })
        .eq("id", user.id);
      setFullName(guardianFull);
      setStudents(inserted ?? []);
      if (inserted && inserted.length > 0) setSelectedStudentId(inserted[0].id);
      setLoading(false);
    } else {
      if (!adultInfo.firstName.trim() || !adultInfo.lastName.trim()) {
        toast.error("First and last name are required");
        return;
      }
      if (!adultInfo.email.trim() || !adultInfo.phone.trim()) {
        toast.error("Email and phone are required");
        return;
      }
      setLoading(true);
      const adultFull = `${adultInfo.firstName.trim()} ${adultInfo.lastName.trim()}`.slice(0, 100);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: adultFull,
          email: adultInfo.email.trim().slice(0, 255),
          phone: adultInfo.phone.trim().slice(0, 20),
        })
        .eq("id", user.id);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setFullName(adultFull);
      setStudents([]);
      setSelectedStudentId(null);
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

  useEffect(() => {
    if (step !== 3) return;
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
          .limit(20),
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

  function handleConfirmLesson() {
    if (lessonCart.length === 0) {
      toast.error("Please add at least one registration.");
      return;
    }
    setStep(4);
  }

  // Used in payment review summary + memo
  const reviewSummary = (() => {
    if (registrationType === "junior") {
      const age = calcAge(juniorPlayer.dateOfBirth);
      const playerName = `${juniorPlayer.firstName} ${juniorPlayer.lastName}`.trim();
      const guardianName = `${guardian.firstName} ${guardian.lastName}`.trim();
      return {
        type: "junior" as const,
        playerName,
        playerAge: age,
        guardianName,
        guardianRelationship: guardian.relationship,
        contactEmail: guardian.email,
        contactPhone: guardian.phone,
        memoName: playerName,
      };
    }
    const playerName = `${adultInfo.firstName} ${adultInfo.lastName}`.trim() || fullName;
    return {
      type: "adult" as const,
      playerName,
      playerAge: null as number | null,
      guardianName: "",
      guardianRelationship: "",
      contactEmail: adultInfo.email || email,
      contactPhone: adultInfo.phone || phone,
      memoName: playerName,
    };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <span className="text-2xl">🎾</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome to 2026 Tennis Lessons</h1>
          <p className="mt-1 text-sm text-muted-foreground">Get court-ready in a few quick steps</p>
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
            <PlayerStep
              registrationType={registrationType}
              setRegistrationType={setRegistrationType}
              adultInfo={adultInfo} setAdultInfo={setAdultInfo}
              juniorPlayer={juniorPlayer} setJuniorPlayer={setJuniorPlayer}
              guardian={guardian} setGuardian={setGuardian}
              onBack={() => setStep(0)} onNext={handlePlayerInfo} loading={loading}
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
            <LessonStep
              lessons={lessons}
              loading={lessonsLoading}
              lessonCart={lessonCart}
              addLessonToCart={addLessonToCart}
              removeLessonFromCart={removeLessonFromCart}
              students={students}
              selectedStudentId={selectedStudentId}
              setSelectedStudentId={setSelectedStudentId}
              returningClient={returningClient}
              onBack={() => setStep(2)}
              onNext={handleConfirmLesson}
            />
          )}
          {step === 4 && lessonCart.length > 0 && (
            <PaymentStep
              lessonCart={lessonCart}
              lessons={lessons}
              students={students}
              savedCardLast4={savedCardLast4}
              reviewSummary={reviewSummary}
              onBack={() => setStep(3)}
              onCancel={() => navigate({ to: "/" })}
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
          <p className="text-sm text-muted-foreground">Sign in to book your next lesson.</p>
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
        <p className="text-sm text-muted-foreground">Let's get you signed up.</p>
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

function PlayerStep(props: {
  registrationType: RegistrationType;
  setRegistrationType: (v: RegistrationType) => void;
  adultInfo: AdultInfo; setAdultInfo: (v: AdultInfo) => void;
  juniorPlayer: JuniorPlayerInfo; setJuniorPlayer: (v: JuniorPlayerInfo) => void;
  guardian: GuardianInfo; setGuardian: (v: GuardianInfo) => void;
  onBack: () => void; onNext: () => void; loading: boolean;
}) {
  const { registrationType, adultInfo, juniorPlayer, guardian } = props;
  const age = calcAge(juniorPlayer.dateOfBirth);
  const ageWarning = registrationType === "junior" && age !== null && age >= 18;
  const authError = registrationType === "junior" && !guardian.authorized;
  const disableNext = ageWarning;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Player Information</h2>
        <p className="text-sm text-muted-foreground">Tell us who's hitting the court.</p>
      </div>

      {/* Pill-style player type selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Who is signing up for lessons?</Label>
        <div className="flex w-full gap-1 rounded-full border border-border bg-secondary/40 p-1">
          {(["adult", "junior"] as const).map((t) => {
            const selected = registrationType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => props.setRegistrationType(t)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  selected
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "adult" ? "Adult Player" : "Junior Player (Under 18)"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Smooth fade transition */}
      <div className="relative">
        <div
          key={registrationType}
          className="space-y-5 animate-in fade-in-50 slide-in-from-bottom-1 duration-200"
        >
          {registrationType === "adult" ? (
            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field id="a-first" label="First Name *" value={adultInfo.firstName} onChange={(v) => props.setAdultInfo({ ...adultInfo, firstName: v })} placeholder="Jane" />
                <Field id="a-last" label="Last Name *" value={adultInfo.lastName} onChange={(v) => props.setAdultInfo({ ...adultInfo, lastName: v })} placeholder="Doe" />
              </div>
              <Field id="a-email" label="Email *" type="email" value={adultInfo.email} onChange={(v) => props.setAdultInfo({ ...adultInfo, email: v })} placeholder="you@example.com" />
              <Field id="a-phone" label="Phone Number *" type="tel" value={adultInfo.phone} onChange={(v) => props.setAdultInfo({ ...adultInfo, phone: v })} placeholder="(555) 123-4567" />
              <SkillSelect id="a-skill" value={adultInfo.skillLevel} onChange={(v) => props.setAdultInfo({ ...adultInfo, skillLevel: v })} />
            </div>
          ) : (
            <>
              {/* Section A — Child / Player */}
              <section className="space-y-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <span>🎾</span> Player Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="j-first" label="First Name *" value={juniorPlayer.firstName} onChange={(v) => props.setJuniorPlayer({ ...juniorPlayer, firstName: v })} placeholder="Jamie" />
                  <Field id="j-last" label="Last Name *" value={juniorPlayer.lastName} onChange={(v) => props.setJuniorPlayer({ ...juniorPlayer, lastName: v })} placeholder="Thompson" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="j-dob">Date of Birth *</Label>
                  <Input
                    id="j-dob"
                    type="date"
                    value={juniorPlayer.dateOfBirth}
                    onChange={(e) => props.setJuniorPlayer({ ...juniorPlayer, dateOfBirth: e.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  {age !== null && !ageWarning && (
                    <p className="text-xs text-muted-foreground">Age: {age}</p>
                  )}
                  {ageWarning && (
                    <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      This player appears to be 18 or older. Please select 'Adult Player' instead.
                    </p>
                  )}
                </div>
                <SkillSelect id="j-skill" value={juniorPlayer.skillLevel} onChange={(v) => props.setJuniorPlayer({ ...juniorPlayer, skillLevel: v })} />
              </section>

              {/* Section B — Guardian */}
              <section className="space-y-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <span>👤</span> Parent / Guardian Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="g-first" label="Parent First Name *" value={guardian.firstName} onChange={(v) => props.setGuardian({ ...guardian, firstName: v })} placeholder="Sarah" />
                  <Field id="g-last" label="Parent Last Name *" value={guardian.lastName} onChange={(v) => props.setGuardian({ ...guardian, lastName: v })} placeholder="Thompson" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-rel">Relationship to Player *</Label>
                  <select
                    id="g-rel"
                    value={guardian.relationship}
                    onChange={(e) => props.setGuardian({ ...guardian, relationship: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <Field id="g-email" label="Email Address *" type="email" value={guardian.email} onChange={(v) => props.setGuardian({ ...guardian, email: v })} placeholder="parent@example.com" />
                <Field id="g-phone" label="Phone Number *" type="tel" value={guardian.phone} onChange={(v) => props.setGuardian({ ...guardian, phone: v })} placeholder="(555) 123-4567" />
                <Field id="g-emer" label="Emergency Contact # (if different)" type="tel" value={guardian.emergencyPhone} onChange={(v) => props.setGuardian({ ...guardian, emergencyPhone: v })} placeholder="(555) 987-6543" />

                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-secondary/30 p-3">
                  <Checkbox
                    id="g-auth"
                    checked={guardian.authorized}
                    onCheckedChange={(v) => props.setGuardian({ ...guardian, authorized: v === true })}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    I am the parent/legal guardian of this player and authorize their participation in tennis lessons.
                  </span>
                </label>
                {authError && (
                  <p className="text-xs font-medium text-destructive">
                    Please confirm you are the parent or legal guardian to continue.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <NavRow onBack={props.onBack} onNext={props.onNext} loading={props.loading} disabled={disableNext} />
    </div>
  );
}

function SkillSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Skill Level</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Select skill level</option>
        {SKILL_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

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
        <span className="text-sm font-medium">I agree to the terms</span>
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

function LessonStep(props: {
  lessons: Lesson[];
  loading: boolean;
  lessonCart: LessonCartItem[];
  addLessonToCart: (lessonId: string, studentId: string | null) => void;
  removeLessonFromCart: (index: number) => void;
  students: Student[];
  selectedStudentId: string | null;
  setSelectedStudentId: (v: string) => void;
  returningClient: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const [view, setView] = useState<"calendar" | "list">(props.returningClient ? "calendar" : "list");
  const [waitlistJoining, setWaitlistJoining] = useState<string | null>(null);
  const [waitlistedIds, setWaitlistedIds] = useState<Set<string>>(new Set());

  async function joinWaitlist(lessonId: string) {
    setWaitlistJoining(lessonId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Please sign in first"); return; }
      const { error } = await supabase.from("waitlist").insert({
        lesson_id: lessonId,
        profile_id: user.id,
        student_id: props.selectedStudentId,
      });
      if (error) { toast.error(error.message); return; }
      setWaitlistedIds((s) => new Set(s).add(lessonId));
      toast.success("You're on the waitlist — we'll notify you if a spot opens.");
    } finally {
      setWaitlistJoining(null);
    }
  }

  function handleAdd(lessonId: string) {
    if (props.students.length > 0 && !props.selectedStudentId) {
      toast.error("Please choose which player this is for");
      return;
    }
    props.addLessonToCart(lessonId, props.students.length > 0 ? props.selectedStudentId : null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Pick lessons</h2>
          <p className="text-sm text-muted-foreground">Choose a player, then add lessons to your cart.</p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as "calendar" | "list")}
          variant="outline"
          size="sm"
          className="bg-secondary/40 rounded-md p-0.5"
        >
          <ToggleGroupItem value="calendar" className="gap-1.5">
            <CalendarRange className="h-4 w-4" /> Calendar
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" /> List
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {props.students.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Player</Label>
          <select
            value={props.selectedStudentId ?? ""}
            onChange={(e) => props.setSelectedStudentId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {props.students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {props.loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading lessons…</div>
      ) : props.lessons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No upcoming lessons available yet. Please check back soon.
        </div>
      ) : view === "calendar" ? (
        <CalendarView
          lessons={props.lessons}
          onAdd={handleAdd}
          onJoinWaitlist={joinWaitlist}
          waitlistJoining={waitlistJoining}
          waitlistedIds={waitlistedIds}
        />
      ) : (
        <div className="space-y-2">
          {props.lessons.map((l) => {
            const isFull = l.booked >= l.capacity;
            const date = new Date(l.start_time);
            const end = new Date(l.end_time);
            return (
              <div
                key={l.id}
                className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                  isFull ? "border-border bg-muted/40 opacity-60" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{l.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} –{" "}
                      {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {l.booked}/{l.capacity} booked
                      {isFull && <span className="ml-1 font-semibold text-destructive">Full</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-0.5 text-lg font-bold text-primary">
                      <DollarSign className="h-4 w-4" />
                      {l.price.toFixed(2)}
                    </div>
                    {isFull ? (
                      waitlistedIds.has(l.id) ? (
                        <span className="text-xs font-medium text-primary">✓ On waitlist</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => joinWaitlist(l.id)}
                          disabled={waitlistJoining === l.id}
                        >
                          {waitlistJoining === l.id ? "Joining…" : "Join waitlist"}
                        </Button>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAdd(l.id)}
                      >
                        Add for selected player
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-primary/80">
            Registration cart ({props.lessonCart.length})
          </div>
          {props.lessonCart.length > 0 && (
            <div className="text-sm font-bold text-primary">
              Total: ${props.lessonCart
                .reduce((sum, item) => {
                  const lesson = props.lessons.find((l) => l.id === item.lessonId);
                  return sum + (lesson?.price ?? 0);
                }, 0)
                .toFixed(2)}
            </div>
          )}
        </div>
        {props.lessonCart.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No registrations yet. Choose a player and add lessons above.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.lessonCart.map((item, idx) => {
              const lesson = props.lessons.find((l) => l.id === item.lessonId);
              const student = props.students.find((s) => s.id === item.studentId);
              if (!lesson) return null;
              const d = new Date(lesson.start_time);
              return (
                <li
                  key={`${item.lessonId}-${item.studentId ?? "adult"}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {student?.name ?? "Adult"} — {lesson.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.toLocaleString(undefined, {
                        weekday: "short", month: "short", day: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">${lesson.price.toFixed(2)}</div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => props.removeLessonFromCart(idx)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NavRow onBack={props.onBack} onNext={props.onNext} loading={false} nextLabel="Continue to payment" />
    </div>
  );
}

function CalendarView(props: {
  lessons: Lesson[];
  onAdd: (lessonId: string) => void;
  onJoinWaitlist: (id: string) => void;
  waitlistJoining: string | null;
  waitlistedIds: Set<string>;
}) {
  const first = props.lessons[0] ? new Date(props.lessons[0].start_time) : new Date();
  const weekStart = new Date(first);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  const days: { date: Date; lessons: Lesson[] }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    return {
      date: d,
      lessons: props.lessons
        .filter((l) => {
          const t = new Date(l.start_time);
          return t >= d && t < next;
        })
        .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)),
    };
  });

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-7 gap-1.5 min-w-[640px]">
        {days.map(({ date, lessons }) => (
          <div key={date.toISOString()} className="flex flex-col gap-1.5">
            <div className="text-center py-1.5 rounded-md bg-secondary/40 border border-border">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="text-sm font-bold">
                {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 min-h-[80px]">
              {lessons.length === 0 ? (
                <div className="flex-1 rounded-md border border-dashed border-border/60 p-2 text-center text-[10px] text-muted-foreground/60">
                  —
                </div>
              ) : (
                lessons.map((l) => {
                  const isFull = l.booked >= l.capacity;
                  const t = new Date(l.start_time);
                  const time = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                  const waitlisted = props.waitlistedIds.has(l.id);
                  if (isFull) {
                    return (
                      <div
                        key={l.id}
                        className="rounded-md border border-border bg-muted/50 p-2 text-left"
                      >
                        <div className="text-[10px] font-semibold text-muted-foreground">{time}</div>
                        <div className="text-xs font-medium text-muted-foreground line-clamp-2 mt-0.5">
                          {l.title}
                        </div>
                        <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0">Full {l.booked}/{l.capacity}</Badge>
                        {waitlisted ? (
                          <div className="mt-1 text-[10px] font-medium text-primary">✓ On waitlist</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => props.onJoinWaitlist(l.id)}
                            disabled={props.waitlistJoining === l.id}
                            className="mt-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            {props.waitlistJoining === l.id ? "Joining…" : "Join Waitlist"}
                          </button>
                        )}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => props.onAdd(l.id)}
                      className="rounded-md border-2 border-border bg-background p-2 text-left transition-all hover:border-primary/50 hover:bg-secondary/40"
                    >
                      <div className="text-[10px] font-semibold text-muted-foreground">
                        {time}
                      </div>
                      <div className="text-xs font-semibold line-clamp-2 mt-0.5">
                        {l.title}
                      </div>
                      <div className="text-[10px] mt-0.5 text-muted-foreground">
                        ${l.price.toFixed(0)} · {l.booked}/{l.capacity}
                      </div>
                      <div className="mt-1 text-[10px] font-medium text-primary">+ Add</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ReviewSummary = {
  type: RegistrationType;
  playerName: string;
  playerAge: number | null;
  guardianName: string;
  guardianRelationship: string;
  contactEmail: string;
  contactPhone: string;
  memoName: string;
};

function PaymentStep(props: {
  lessonCart: LessonCartItem[];
  lessons: Lesson[];
  students: Student[];
  savedCardLast4: string | null;
  reviewSummary: ReviewSummary;
  onBack: () => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [paid, setPaid] = useState(false);
  const [stayForMatchPlay, setStayForMatchPlay] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  const items = props.lessonCart
    .map((item) => {
      const lesson = props.lessons.find((l) => l.id === item.lessonId);
      const student = props.students.find((s) => s.id === item.studentId);
      return lesson ? { item, lesson, student } : null;
    })
    .filter((x): x is { item: LessonCartItem; lesson: Lesson; student: Student | undefined } => x !== null);

  const total = items.reduce((sum, { lesson }) => sum + lesson.price, 0);
  const single = items.length === 1 ? items[0] : null;
  const isMorningMix = single?.lesson.lesson_type === "adult_morning_mix";

  // Lesson date string for memo (first lesson date)
  const firstLessonDate = items[0]
    ? new Date(items[0].lesson.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Review & Payment</h2>
        <p className="text-sm text-muted-foreground">Confirm your details and complete payment.</p>
      </div>

      {/* Review summary */}
      <div className="rounded-lg border border-border bg-background p-4 space-y-1.5 text-sm">
        {props.reviewSummary.type === "junior" ? (
          <>
            <div>
              <span className="font-semibold">Player:</span>{" "}
              {props.reviewSummary.playerName}
              {props.reviewSummary.playerAge !== null && ` (Age ${props.reviewSummary.playerAge})`}
            </div>
            <div>
              <span className="font-semibold">Parent/Guardian:</span>{" "}
              {props.reviewSummary.guardianName}
              {props.reviewSummary.guardianRelationship && ` (${props.reviewSummary.guardianRelationship})`}
            </div>
            <div className="text-muted-foreground">
              <span className="font-semibold text-foreground">Contact:</span>{" "}
              {props.reviewSummary.contactEmail} | {props.reviewSummary.contactPhone}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="font-semibold">Player:</span> {props.reviewSummary.playerName}
            </div>
            <div className="text-muted-foreground">
              <span className="font-semibold text-foreground">Contact:</span>{" "}
              {props.reviewSummary.contactEmail} | {props.reviewSummary.contactPhone}
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Registrations ({items.length})
        </div>
        <ul className="mt-2 space-y-2">
          {items.map(({ item, lesson, student }, idx) => {
            const d = new Date(lesson.start_time);
            return (
              <li
                key={`${item.lessonId}-${item.studentId ?? "adult"}-${idx}`}
                className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {student?.name ?? "Adult"} — {lesson.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="text-sm font-semibold">${lesson.price.toFixed(2)}</div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div className="text-sm font-semibold">Total</div>
          <div className="text-2xl font-bold">${total.toFixed(2)}</div>
        </div>
      </div>

      {isMorningMix && single && !paid && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3 hover:bg-secondary/40">
          <Checkbox
            checked={stayForMatchPlay}
            onCheckedChange={(v) => setStayForMatchPlay(v === true)}
            className="mt-0.5"
          />
          <div className="text-sm">
            <div className="font-medium">Staying after for organized match play?</div>
            <div className="text-xs text-muted-foreground">We'll let other adults know you're sticking around.</div>
          </div>
        </label>
      )}

      <div className="rounded-lg border-2 border-accent bg-accent/15 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-accent-foreground" />
          <div className="text-sm">
            <div className="font-semibold text-accent-foreground">⚠️ Cancellation Policy</div>
            <p className="mt-1 text-accent-foreground/90">
              Cancellations made less than 24 hours before your scheduled lesson will incur a 50% fee.
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
          <Button onClick={() => navigate({ to: "/" })} className="mt-5">Done</Button>
        </div>
      ) : selectedMethod ? (
        <PaymentConfirm
          method={selectedMethod}
          depositAmount={total}
          clientName={props.reviewSummary.memoName}
          lessonDate={firstLessonDate}
          onConfirm={() => setPaid(true)}
          onBack={() => setSelectedMethod(null)}
        />
      ) : (
        <PaymentMethodPicker onSelect={setSelectedMethod} />
      )}

      {!paid && !selectedMethod && (
        <Button onClick={props.onBack} variant="ghost" className="w-full">
          ← Edit registrations
        </Button>
      )}
    </div>
  );
}


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

// ============== Payment ==============

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

const ALYSE_PHONE_DISPLAY = "337-345-2908";
const ALYSE_PHONE_RAW = "3373452908";
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
      <div className="font-medium">💡 All payments go directly to {ALYSE_NAME}.</div>
      <div className="mt-1 text-xs">
        Always confirm you see the name <span className="font-semibold">{ALYSE_NAME}</span> as the recipient before completing any payment.
        <br />
        Phone: {ALYSE_PHONE_DISPLAY} | Email: {ALYSE_EMAIL}
      </div>
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

function PaymentConfirm({
  method,
  depositAmount,
  clientName,
  lessonDate,
  onConfirm,
  onBack,
}: {
  method: PaymentMethod;
  depositAmount: number;
  clientName: string;
  lessonDate: string;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const amount = depositAmount.toFixed(2);
  const memo = `${clientName} – ${lessonDate}`;

  let body: React.ReactNode = null;

  if (method.id === "zelle") {
    body = (
      <>
        <div className="text-sm font-semibold">To pay via Zelle:</div>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Open your banking app and go to Zelle</li>
          <li>Search for: <span className="font-mono font-semibold">{ALYSE_PHONE_RAW}</span></li>
          <li>Confirm the recipient name shows <span className="font-semibold">{ALYSE_NAME}</span> before sending</li>
          <li>Send <span className="font-semibold">${amount}</span> and in the memo write:<br /><span className="font-mono text-xs">{memo}</span></li>
          <li>Return here and click "I've Paid" below</li>
        </ol>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          📱 <span className="font-semibold">Zelle Number:</span> {ALYSE_PHONE_DISPLAY}<br />
          <span className="font-semibold">Recipient:</span> {ALYSE_NAME}<br />
          Always confirm the recipient name before sending.
        </div>
      </>
    );
  } else if (method.id === "applepay") {
    body = (
      <>
        <div className="text-sm font-semibold">To pay via Apple Pay:</div>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Open your Messages app on iPhone</li>
          <li>Start a new message to: <span className="font-mono font-semibold">{ALYSE_PHONE_RAW}</span></li>
          <li>Tap the Apple Pay icon inside the message</li>
          <li>Confirm the recipient name shows <span className="font-semibold">{ALYSE_NAME}</span> before sending</li>
          <li>Send <span className="font-semibold">${amount}</span> and add a note:<br /><span className="font-mono text-xs">{memo}</span></li>
          <li>Return here and click "I've Paid" below</li>
        </ol>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          📱 <span className="font-semibold">Apple Pay Number:</span> {ALYSE_PHONE_DISPLAY}<br />
          <span className="font-semibold">Recipient:</span> {ALYSE_NAME}<br />
          Always confirm the recipient name before sending.
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
            <li>Link: <span className="font-mono">{VENMO_HANDLE}</span>, or</li>
            <li>Phone number: <span className="font-mono">{ALYSE_PHONE_DISPLAY}</span></li>
          </ul>
        </div>
        <div className="text-sm">
          Send <span className="font-semibold">${amount}</span> to <span className="font-semibold">{ALYSE_NAME}</span>
          <br />In the note write: <span className="font-mono text-xs">{memo}</span>
        </div>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          Always confirm the recipient name shows <span className="font-semibold">{ALYSE_NAME}</span> before sending.
        </div>
        <p className="text-sm">Once your payment is sent, click below.</p>
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
            <li>Cashtag: <span className="font-mono">{CASHAPP_TAG}</span>, or</li>
            <li>Phone number: <span className="font-mono">{ALYSE_PHONE_DISPLAY}</span></li>
          </ul>
        </div>
        <div className="text-sm">
          Send <span className="font-semibold">${amount}</span> to <span className="font-semibold">{ALYSE_NAME}</span>
          <br />In the note write: <span className="font-mono text-xs">{memo}</span>
        </div>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-900/40 dark:text-yellow-100">
          Always confirm the recipient name shows <span className="font-semibold">{ALYSE_NAME}</span> before sending.
        </div>
        <p className="text-sm">Once your payment is sent, click below.</p>
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
