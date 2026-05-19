import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";
import { CheckCircle2, AlertTriangle, Plus, Trash2, Lock } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get Started — Ace Tennis Academy" },
      { name: "description", content: "Join Ace Tennis Academy in 4 simple steps." },
    ],
  }),
  component: OnboardingPage,
});

type Child = { name: string; age: string; gender: string };

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(7, "Phone is too short").max(20),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const STEPS = ["Sign Up", "Player Info", "Waiver", "Payment"] as const;

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

  // step 3
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");

  // step 4
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");

  const updateChild = (i: number, patch: Partial<Child>) =>
    setChildren((arr) => arr.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addChild = () => setChildren((a) => [...a, { name: "", age: "", gender: "" }]);
  const removeChild = (i: number) => setChildren((a) => a.filter((_, idx) => idx !== i));

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
    // Wait briefly for trigger to create profile, then update phone/full_name
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

  async function handlePlayerInfo() {
    if (registeringChild) {
      const valid = children.filter((c) => c.name.trim());
      if (valid.length === 0) {
        toast.error("Add at least one child or uncheck the box");
        return;
      }
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Session expired");
        setLoading(false);
        return;
      }
      const rows = valid.map((c) => ({
        parent_id: user.id,
        name: c.name.trim().slice(0, 100),
        age: c.age ? Math.max(1, Math.min(100, parseInt(c.age, 10) || 0)) : null,
        gender: c.gender ? c.gender.slice(0, 30) : null,
      }));
      const { error } = await supabase.from("students").insert(rows);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Session expired");
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        waiver_signed: true,
        waiver_signature: signature.trim().slice(0, 100),
        waiver_signed_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep(3);
  }

  async function handlePayment() {
    if (!cardName || cardNumber.replace(/\s/g, "").length < 12 || !exp || cvc.length < 3) {
      toast.error("Please fill in all card details");
      return;
    }
    setLoading(true);
    // Mock payment delay
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    toast.success("Welcome to Ace Tennis Academy! 🎾");
    setTimeout(() => navigate({ to: "/" }), 800);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <span className="text-2xl">🎾</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Join Ace Tennis Academy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Get court-ready in 4 quick steps</p>
        </header>

        <Stepper step={step} />

        <Card className="mt-6 border-border/60 p-5 shadow-sm sm:p-8">
          {step === 0 && (
            <SignupStep
              fullName={fullName} setFullName={setFullName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              password={password} setPassword={setPassword}
              onNext={handleSignup} loading={loading}
            />
          )}
          {step === 1 && (
            <PlayerStep
              registeringChild={registeringChild} setRegisteringChild={setRegisteringChild}
              children={children} updateChild={updateChild}
              addChild={addChild} removeChild={removeChild}
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
            <PaymentStep
              cardName={cardName} setCardName={setCardName}
              cardNumber={cardNumber} setCardNumber={setCardNumber}
              exp={exp} setExp={setExp} cvc={cvc} setCvc={setCvc}
              onBack={() => setStep(2)} onNext={handlePayment} loading={loading}
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
  onNext: () => void; loading: boolean;
}) {
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
    </div>
  );
}

function PlayerStep(props: {
  registeringChild: boolean; setRegisteringChild: (v: boolean) => void;
  children: Child[];
  updateChild: (i: number, p: Partial<Child>) => void;
  addChild: () => void; removeChild: (i: number) => void;
  onBack: () => void; onNext: () => void; loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Player information</h2>
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

      {props.registeringChild && (
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
                    <option value="">—</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={props.addChild} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Another Child
          </Button>
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

function PaymentStep(props: {
  cardName: string; setCardName: (v: string) => void;
  cardNumber: string; setCardNumber: (v: string) => void;
  exp: string; setExp: (v: string) => void;
  cvc: string; setCvc: (v: string) => void;
  onBack: () => void; onNext: () => void; loading: boolean;
}) {
  const formatCard = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  const formatExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Payment details</h2>
        <p className="text-sm text-muted-foreground">Complete your registration.</p>
      </div>

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

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Registration Fee</div>
            <div className="text-2xl font-bold">$49.00</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Secure checkout
          </div>
        </div>

        <Field id="cardName" label="Name on card" value={props.cardName} onChange={props.setCardName} placeholder="Jane Doe" />
        <Field
          id="cardNumber" label="Card number"
          value={props.cardNumber}
          onChange={(v) => props.setCardNumber(formatCard(v))}
          placeholder="4242 4242 4242 4242"
          inputMode="numeric"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="exp" label="Expiry"
            value={props.exp}
            onChange={(v) => props.setExp(formatExp(v))}
            placeholder="MM/YY" inputMode="numeric"
          />
          <Field
            id="cvc" label="CVC"
            value={props.cvc}
            onChange={(v) => props.setCvc(v.replace(/\D/g, "").slice(0, 4))}
            placeholder="123" inputMode="numeric"
          />
        </div>
      </div>

      <Button onClick={props.onNext} disabled={props.loading} className="w-full" size="lg">
        <Lock className="mr-2 h-4 w-4" />
        {props.loading ? "Processing..." : "Pay $49.00"}
      </Button>
      <Button onClick={props.onBack} variant="ghost" className="w-full" disabled={props.loading}>
        Back
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Mock checkout — no real charge will occur.
      </p>
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

function NavRow({ onBack, onNext, loading }: { onBack: () => void; onNext: () => void; loading: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button variant="outline" onClick={onBack} disabled={loading} className="flex-1">Back</Button>
      <Button onClick={onNext} disabled={loading} className="flex-1">
        {loading ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
