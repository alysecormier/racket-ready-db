import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Calendar as CalIcon, Download, Pencil, ChevronDown, ChevronUp } from "lucide-react";

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
  deposit_status: string | null;
  participant_id: string;
};

type Participant = {
  id: string;
  first_name: string;
  last_name: string;
  participant_type: string;
  age: number | null;
  gender: string | null;
  is_account_holder: boolean;
};

type Account = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

const LOCATION_STR = "Fairground Park, Eunice LA";

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toIcsUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}
function buildIcsForBooking(b: Booking, firstName: string): string {
  const start = new Date(`${b.lesson_date}T${b.lesson_start_time ?? "09:00:00"}`);
  const end = new Date(`${b.lesson_date}T${b.lesson_end_time ?? "10:00:00"}`);
  const dtstamp = toIcsUtc(new Date());
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//2026 Tennis Lessons//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@2026tennislessons`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${esc(`🎾 Tennis Lesson – ${firstName}`)}`,
    `LOCATION:${esc(LOCATION_STR)}`,
    `DESCRIPTION:${esc(b.lesson_name)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
function googleCalendarUrl(b: Booking, firstName: string): string {
  const start = new Date(`${b.lesson_date}T${b.lesson_start_time ?? "09:00:00"}`);
  const end = new Date(`${b.lesson_date}T${b.lesson_end_time ?? "10:00:00"}`);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `🎾 Tennis Lesson – ${firstName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: b.lesson_name,
    location: LOCATION_STR,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [showPast, setShowPast] = useState(true);
  const [showAccount, setShowAccount] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate({ to: "/onboarding" });
      return;
    }
    const [accRes, partsRes, bookRes] = await Promise.all([
      supabase.from("accounts").select("id, first_name, last_name, email, phone").eq("id", user.id).maybeSingle(),
      supabase.from("participants").select("id, first_name, last_name, participant_type, age, gender, is_account_holder").eq("account_id", user.id).eq("is_saved", true).order("is_account_holder", { ascending: false }),
      supabase.from("lesson_bookings").select("id, lesson_name, lesson_date, lesson_start_time, lesson_end_time, cancellation_status, deposit_status, participant_id").eq("account_id", user.id).order("lesson_date", { ascending: true }),
    ]);
    setAccount(accRes.data ?? null);
    setParticipants(partsRes.data ?? []);
    // Dedupe defensively by id
    const seen = new Set<string>();
    const uniqueBookings = (bookRes.data ?? []).filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
    setBookings(uniqueBookings);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const today = new Date().toISOString().slice(0, 10);

  // All active (non-cancelled) lessons the user has signed up for
  const activeBookings = useMemo(
    () => bookings.filter((b) => b.cancellation_status === "Active"),
    [bookings],
  );
  const upcoming = useMemo(
    () => activeBookings.filter((b) => b.lesson_date >= today),
    [activeBookings, today],
  );
  const past = useMemo(
    () => activeBookings.filter((b) => b.lesson_date < today),
    [activeBookings, today],
  );
  const cancelled = useMemo(
    () => bookings.filter((b) => b.cancellation_status !== "Active"),
    [bookings],
  );

  // participants that have at least one active booking
  const participantsWithUpcoming = useMemo(() => {
    const ids = new Set(activeBookings.map((b) => b.participant_id));
    return participants.filter((p) => ids.has(p.id));
  }, [activeBookings, participants]);

  const visibleUpcoming = useMemo(() => {
    if (activeTab === "all") return upcoming;
    return upcoming.filter((b) => b.participant_id === activeTab);
  }, [upcoming, activeTab]);

  const participantName = (id: string) => {
    const p = participants.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "—";
  };
  const participantFirst = (id: string) => {
    const p = participants.find((x) => x.id === id);
    return p?.first_name ?? "participant";
  };

  async function handleCancel(b: Booking) {
    const start = new Date(`${b.lesson_date}T${b.lesson_start_time ?? "09:00:00"}`);
    const hoursUntil = (start.getTime() - Date.now()) / 36e5;
    const isLate = hoursUntil < 24;
    const msg = isLate
      ? "This lesson is within 24 hours. Cancelling now is a late cancellation and your deposit will be forfeited. Continue?"
      : "Are you sure you want to cancel this lesson?";
    if (!window.confirm(msg)) return;

    const update = isLate
      ? { cancellation_status: "Cancelled-Late", cancellation_requested_at: new Date().toISOString(), deposit_status: "Forfeited" }
      : { cancellation_status: "Cancelled-Valid", cancellation_requested_at: new Date().toISOString() };
    const { error } = await supabase.from("lesson_bookings").update(update).eq("id", b.id);
    if (error) { toast.error("Could not cancel — please try again."); return; }
    if (isLate && account?.id) {
      await supabase.from("accounts").update({ account_status: "Deposit Required" }).eq("id", account.id);
    }
    toast.success(isLate ? "Lesson cancelled (late)." : "Lesson cancelled.");
    loadAll();
  }

  const welcomeName = account?.first_name || "friend";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <Toaster />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {welcomeName}! 🎾</h1>
            <p className="text-sm text-muted-foreground">Fairground Park · Eunice, Louisiana</p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            Sign out
          </Button>
        </header>

        <Link to="/onboarding" search={{ book: 1 }}>
          <Button className="mb-6 w-full bg-green-600 hover:bg-green-700 text-white">
            + Book More Lessons
          </Button>
        </Link>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            Your Lessons{!loading && ` (${upcoming.length} upcoming)`}
          </h2>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : upcoming.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm">No upcoming lessons scheduled.</p>
              <Link to="/onboarding" search={{ book: 1 }}>
                <Button className="mt-3 bg-green-600 hover:bg-green-700 text-white">Book a Lesson →</Button>
              </Link>
            </Card>
          ) : (
            <>
              {participantsWithUpcoming.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`rounded-full border px-3 py-1 text-sm ${activeTab === "all" ? "bg-green-600 text-white border-green-600" : "bg-background"}`}
                  >
                    All
                  </button>
                  {participantsWithUpcoming.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveTab(p.id)}
                      className={`rounded-full border px-3 py-1 text-sm ${activeTab === p.id ? "bg-green-600 text-white border-green-600" : "bg-background"}`}
                    >
                      {p.first_name}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {visibleUpcoming.map((b) => {
                  const d = new Date(b.lesson_date + "T00:00:00");
                  return (
                    <Card key={b.id} className="p-4 border-2 border-green-600/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">🎾 {b.lesson_name}</div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${b.deposit_status === "Confirmed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                          {b.deposit_status === "Confirmed" ? "Confirmed" : "Pending"}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {b.lesson_start_time && ` · ${b.lesson_start_time.slice(0, 5)}`}
                        {b.lesson_end_time && `–${b.lesson_end_time.slice(0, 5)}`}
                      </div>
                      <div className="text-sm text-muted-foreground">📍 {LOCATION_STR}</div>
                      <div className="text-sm">For: <span className="font-medium">{participantName(b.participant_id)}</span></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleCancel(b)}>
                          Cancel Lesson
                        </Button>
                        <a
                          href={googleCalendarUrl(b, participantFirst(b.participant_id))}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            <CalIcon className="mr-1 h-3.5 w-3.5" /> Add to Google Calendar
                          </Button>
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {past.length > 0 && (
          <section className="mb-8">
            <button
              onClick={() => setShowPast((s) => !s)}
              className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left text-sm font-semibold hover:bg-secondary/30"
            >
              <span>{showPast ? "▼" : "▶"} Past Lessons ({past.length})</span>
            </button>
            {showPast && (
              <div className="mt-3 space-y-2">
                {past.map((b) => {
                  const d = new Date(b.lesson_date + "T00:00:00");
                  return (
                    <Card key={b.id} className="p-3 opacity-60">
                      <div className="text-sm font-medium">🎾 {b.lesson_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {b.lesson_start_time && ` · ${b.lesson_start_time.slice(0, 5)}`} · For: {participantName(b.participant_id)}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">My Participants</h2>
          <div className="space-y-2">
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants yet.</p>
            ) : (
              participants.map((p) => (
                <ParticipantRow key={p.id} participant={p} onChanged={loadAll} />
              ))
            )}
          </div>
        </section>

        <section className="mb-8">
          <button
            onClick={() => setShowAccount((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left text-sm font-semibold hover:bg-secondary/30"
          >
            <span>My Account</span>
            {showAccount ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAccount && account && (
            <AccountEditor account={account} onChanged={loadAll} />
          )}
        </section>
      </div>
    </div>
  );
}

function ParticipantRow({ participant, onChanged }: { participant: Participant; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(participant.first_name);
  const [lastName, setLastName] = useState(participant.last_name);
  const [age, setAge] = useState(participant.age?.toString() ?? "");
  const [gender, setGender] = useState(participant.gender ?? "");
  const [saving, setSaving] = useState(false);

  const emoji =
    participant.is_account_holder ? "👤" :
    participant.participant_type === "junior"
      ? (participant.gender === "Girl" ? "👧" : participant.gender === "Boy" ? "👦" : "🧒")
      : "👤";

  async function save() {
    setSaving(true);
    const update: { first_name: string; last_name: string; age?: number | null; gender?: string | null } = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    };
    if (participant.participant_type === "junior") {
      update.age = age ? Number(age) : null;
      update.gender = gender || null;
    }
    const { error } = await supabase.from("participants").update(update).eq("id", participant.id);
    setSaving(false);
    if (error) { toast.error("Could not save changes."); return; }
    toast.success("Saved.");
    setEditing(false);
    onChanged();
  }


  if (editing && !participant.is_account_holder) {
    return (
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          {participant.participant_type === "junior" && (
            <>
              <div>
                <Label className="text-xs">Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Gender</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="Boy">Boy</option>
                  <option value="Girl">Girl</option>
                  <option value="Prefer Not to Say">Prefer Not to Say</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-center justify-between p-3">
      <div className="text-sm">
        <span className="mr-1">{emoji}</span>
        <span className="font-medium">{participant.first_name} {participant.last_name}</span>
        {participant.is_account_holder && <span className="text-muted-foreground"> (You)</span>}
        {participant.participant_type === "junior" && (
          <span className="text-muted-foreground">
            {" "}· Age {participant.age ?? "?"}{participant.gender ? ` · ${participant.gender}` : ""}
          </span>
        )}
      </div>
      {!participant.is_account_holder && (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      )}
    </Card>
  );
}

function AccountEditor({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(account.first_name ?? "");
  const [lastName, setLastName] = useState(account.last_name ?? "");
  const [phone, setPhone] = useState(account.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() })
      .eq("id", account.id);
    setSaving(false);
    if (error) { toast.error("Could not save account."); return; }
    toast.success("Account updated.");
    setEditing(false);
    onChanged();
  }

  if (!editing) {
    return (
      <Card className="mt-3 p-4 space-y-1 text-sm">
        <div><span className="text-muted-foreground">Name:</span> {account.first_name} {account.last_name}</div>
        <div><span className="text-muted-foreground">Email:</span> {account.email}</div>
        <div><span className="text-muted-foreground">Phone:</span> {account.phone}</div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit Account Info
        </Button>
      </Card>
    );
  }
  return (
    <Card className="mt-3 p-4 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">First name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Last name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="text-xs text-muted-foreground">Email cannot be changed.</div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </Card>
  );
}
