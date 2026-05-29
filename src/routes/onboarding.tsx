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
import { CheckCircle2, AlertTriangle, Plus, Trash2, CalendarDays, Users, DollarSign, LayoutGrid, CalendarRange } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { signWaiver } from "@/lib/waiver.functions";
import { getMatchPlayRoster } from "@/lib/match-play.functions";
import { presetByType, recommendedPresetForAge } from "@/lib/lesson-presets";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to 2026 Tennis Lessons" },
      { name: "description", content: "Welcome to 2026 Tennis Lessons — register in a few simple steps." },
    ],
  }),
  component: OnboardingPage,
});

type Child = { name: string; age: string; gender: string };
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

function OnboardingPage() {
  const navigate = useNavigate();
  const signWaiverFn = useServerFn(signWaiver);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // step 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // step 2
  const [registeringChild, setRegisteringChild] = useState(false);
  const [children, setChildren] = useState<Child[]>([{ name: "", age: "", gender: "" }]);
  const [adult, setAdult] = useState<Child>({ name: "", age: "", gender: "" });
  const [students, setStudents] = useState<Student[]>([]);

  // step 3
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");

  // step 4 (lesson selection)
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonCart, setLessonCart] = useState<LessonCartItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // saved card on file (mock)
  const [savedCardLast4, setSavedCardLast4] = useState<string | null>(null);
  const [returningClient, setReturningClient] = useState(false);

  // Privacy: do NOT preload profile/students/waiver/card from an existing session on mount.
  // The portal must always open at step 0 (Sign Up). Returning clients must explicitly sign in.

  async function startFresh() {
    await supabase.auth.signOut();
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setStudents([]);
    setSelectedStudentId(null);
    setRegisteringChild(false);
    setChildren([{ name: "", age: "", gender: "" }]);
    setSavedCardLast4(null);
    setReturningClient(false);
    setLessonCart([]);
    setStep(0);
  }

  const updateChild = (i: number, patch: Partial<Child>) =>
    setChildren((arr) => arr.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addChild = () => setChildren((a) => [...a, { name: "", age: "", gender: "" }]);
  const removeChild = (i: number) => setChildren((a) => a.filter((_, idx) => idx !== i));

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
      setRegisteringChild(true);
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
    if (registeringChild) {
      const valid = children.filter((c) => c.name.trim());
      if (valid.length === 0) {
        toast.error("Add at least one child or uncheck the box");
        return;
      }
      setLoading(true);
      const rows = valid.map((c) => ({
        parent_id: user.id,
        name: c.name.trim().slice(0, 100),
        age: c.age ? Math.max(1, Math.min(100, parseInt(c.age, 10) || 0)) : null,
        gender: c.gender ? c.gender.slice(0, 30) : null,
      }));
      const { data: inserted, error } = await supabase
        .from("students")
        .insert(rows)
        .select("id, name");
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setStudents(inserted ?? []);
      if (inserted && inserted.length > 0) setSelectedStudentId(inserted[0].id);
    } else {
      // Adult registering themselves — no child/student record needed.
      if (!adult.name.trim()) {
        toast.error("Please enter your full name");
        return;
      }
      setLoading(true);
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: adult.name.trim().slice(0, 100) })
        .eq("id", user.id);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setFullName(adult.name.trim());
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
      if (lessonErr) {
        toast.error(lessonErr.message);
      }
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
              registeringChild={registeringChild} setRegisteringChild={setRegisteringChild}
              children={children} updateChild={updateChild}
              addChild={addChild} removeChild={removeChild}
              adult={adult} setAdult={setAdult}
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
  registeringChild: boolean; setRegisteringChild: (v: boolean) => void;
  children: Child[];
  updateChild: (i: number, p: Partial<Child>) => void;
  addChild: () => void; removeChild: (i: number) => void;
  adult: Child; setAdult: (v: Child) => void;
  onBack: () => void; onNext: () => void; loading: boolean;
}) {
  const genderOptions = (
    <>
      <option value="">—</option>
      <option value="female">Female</option>
      <option value="male">Male</option>
      <option value="other">Other</option>
      <option value="prefer_not_to_say">Prefer not to say</option>
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">
          {props.registeringChild ? "Player information" : "Adult Player Information"}
        </h2>
        <p className="text-sm text-muted-foreground">Tell us who's hitting the court.</p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/40 p-4 transition-colors hover:bg-secondary/70">
        <Checkbox
          id="isChild"
          checked={props.registeringChild}
          onCheckedChange={(v) => props.setRegisteringChild(v === true)}
          className="mt-0.5"
        />
        <div>
          <div className="font-medium">Are you registering a child?</div>
          <div className="text-sm text-muted-foreground">Check this if the player is under 18.</div>
        </div>
      </label>

      {props.registeringChild ? (
        <div className="space-y-4">
          {props.children.map((c, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Child {i + 1}</h3>
                {props.children.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => props.removeChild(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Field id={`cn-${i}`} label="Child's Name" value={c.name} onChange={(v) => props.updateChild(i, { name: v })} placeholder="Optional" />
              <div className="grid grid-cols-2 gap-3">
                <Field id={`ca-${i}`} label="Age" type="number" value={c.age} onChange={(v) => props.updateChild(i, { age: v })} placeholder="Optional" />
                <div className="space-y-1.5">
                  <Label htmlFor={`cg-${i}`}>Gender</Label>
                  <select
                    id={`cg-${i}`}
                    value={c.gender}
                    onChange={(e) => props.updateChild(i, { gender: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {genderOptions}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={props.addChild} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Another Child
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <Field id="adult-name" label="Full Name" value={props.adult.name} onChange={(v) => props.setAdult({ ...props.adult, name: v })} placeholder="Jane Doe" />
          <div className="grid grid-cols-2 gap-3">
            <Field id="adult-age" label="Age" type="number" value={props.adult.age} onChange={(v) => props.setAdult({ ...props.adult, age: v })} placeholder="e.g. 32" />
            <div className="space-y-1.5">
              <Label htmlFor="adult-gender">Gender</Label>
              <select
                id="adult-gender"
                value={props.adult.gender}
                onChange={(e) => props.setAdult({ ...props.adult, gender: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {genderOptions}
              </select>
            </div>
          </div>
        </div>
      )}

      <NavRow onBack={props.onBack} onNext={props.onNext} loading={props.loading} />
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
  // Build a week starting on the Monday of the first lesson's week (or current week).
  const first = props.lessons[0] ? new Date(props.lessons[0].start_time) : new Date();
  const weekStart = new Date(first);
  const day = (weekStart.getDay() + 6) % 7; // 0 = Monday
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

function PaymentStep(props: {
  lessonCart: LessonCartItem[];
  lessons: Lesson[];
  students: Student[];
  savedCardLast4: string | null;
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Secure payment</h2>
        <p className="text-sm text-muted-foreground">Review your registrations and complete payment.</p>
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

function NavRow({ onBack, onNext, loading, nextLabel }: { onBack: () => void; onNext: () => void; loading: boolean; nextLabel?: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button variant="outline" onClick={onBack} disabled={loading} className="flex-1">Back</Button>
      <Button onClick={onNext} disabled={loading} className="flex-1">
        {loading ? "Saving..." : (nextLabel ?? "Continue")}
      </Button>
    </div>
  );
}
