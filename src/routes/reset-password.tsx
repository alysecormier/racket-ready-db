import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Ace Tennis Academy" },
      { name: "description", content: "Choose a new password for your account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash; client picks it up.
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/admin" });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-secondary/40 to-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
          {!ready ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Open the reset link from your email to continue. If you arrived here directly, request a new reset email from the sign-in page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">New password</Label>
                <Input id="new-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw">Confirm password</Label>
                <Input id="confirm-pw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              </div>
              <Button type="submit" disabled={saving} className="w-full" size="lg">
                {saving ? "Saving..." : "Update password"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
