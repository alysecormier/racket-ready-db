import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Lessons — 2026 Tennis Lessons" },
      { name: "description", content: "View and manage your upcoming tennis lessons." },
    ],
  }),
  component: DashboardPage,
});

type Booking = {
  id: string;
  lesson_name: string;
  lesson_date: string;
  lesson_start_time: string | null;
  lesson_end_time: string | null;
  cancellation_status: string;
  deposit_status: string;
  participant_id: string;
};

function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/onboarding" });
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("lesson_bookings")
        .select("id, lesson_name, lesson_date, lesson_start_time, lesson_end_time, cancellation_status, deposit_status, participant_id")
        .eq("account_id", user.id)
        .eq("cancellation_status", "Active")
        .gte("lesson_date", today)
        .order("lesson_date", { ascending: true });
      setBookings(data ?? []);

      const ids = Array.from(new Set((data ?? []).map((b) => b.participant_id)));
      if (ids.length) {
        const { data: parts } = await supabase
          .from("participants")
          .select("id, first_name, last_name")
          .in("id", ids);
        const map: Record<string, string> = {};
        (parts ?? []).forEach((p) => { map[p.id] = `${p.first_name} ${p.last_name}`; });
        setParticipantNames(map);
      }
      setLoading(false);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Upcoming Lessons</h1>
          <Button variant="outline" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : bookings.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-4xl">🎾</div>
            <div className="mt-2 text-lg font-semibold">No upcoming lessons</div>
            <p className="mt-1 text-sm text-muted-foreground">Ready to book?</p>
            <Link to="/onboarding">
              <Button className="mt-4 bg-green-600 hover:bg-green-700 text-white">Register for a Lesson</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => {
              const d = new Date(b.lesson_date + "T00:00:00");
              return (
                <Card key={b.id} className="p-4 border-2 border-green-600/30">
                  <div className="font-semibold">🎾 {b.lesson_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    {b.lesson_start_time && ` · ${b.lesson_start_time.slice(0, 5)}`}
                    {b.lesson_end_time && `–${b.lesson_end_time.slice(0, 5)}`}
                  </div>
                  <div className="text-sm text-muted-foreground">Fairground Park, Eunice LA</div>
                  <div className="text-sm">For: <span className="font-medium">{participantNames[b.participant_id] ?? "—"}</span></div>
                  <div className="mt-1 text-xs">
                    Deposit: <span className="font-medium">{b.deposit_status}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
