import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Ace Tennis Academy" },
      { name: "description", content: "Sign in to your Ace Tennis account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const COACH_EMAIL = "alysemcormier@gmail.com";
    const COACH_PASSWORD = "Noworries!";
    if (email.trim().toLowerCase() !== COACH_EMAIL || password !== COACH_PASSWORD) {
      setLoading(false);
      toast.error("Invalid coach credentials.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: COACH_EMAIL,
      password: COACH_PASSWORD,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back, Coach!");
    navigate({ to: "/admin" });
  }

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = resetEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset email sent. Check your inbox.");
    setResetOpen(false);
    setResetEmail("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-secondary/40 to-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl shadow-lg">🎾</div>
          <h1 className="text-2xl font-bold tracking-tight">Coach Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Authorized coaches only</p>
        </div>
        <Card className="p-6 sm:p-8">
          {resetOpen ? (
            <form onSubmit={handleSendReset} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Reset password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your coach email and we'll send you a reset link.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={resetSending} className="flex-1">
                  {resetSending ? "Sending..." : "Send reset link"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => { setResetEmail(email); setResetOpen(true); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Looking to book a lesson?{" "}
            <Link to="/onboarding" className="font-medium text-primary hover:underline">
              Client sign up
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
