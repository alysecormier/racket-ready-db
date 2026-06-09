import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cancelLessonForWeather } from "@/lib/weather.functions";
import { LESSON_PRESETS, presetByType, type LessonType } from "@/lib/lesson-presets";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { deleteClient as deleteClientFn } from "@/lib/roster.functions";
import {
  Search, Check, X, Clock, Users, DollarSign, FileSignature,
  Calendar as CalIcon, ListTodo, Plus, LogOut, CloudRainWind, Trash2,
} from "lucide-react";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Coach Dashboard — Ace Tennis Academy" },
      { name: "description", content: "Admin dashboard for tennis coaches." },
    ],
  }),
  component: AdminPage,
});

type Lesson = {
  id: string; title: string; start_time: string; end_time: string;
  capacity: number; price: number; lesson_type: string | null;
};
type Profile = {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  waiver_signed: boolean; waiver_signed_at: string | null;
};
type Student = {
  id: string; name: string; age: number | null; gender: string | null; parent_id: string;
};
type Booking = {
  id: string; lesson_id: string; profile_id: string; student_id: string | null;
  payment_status: string; signed_waiver: boolean;
};
type Waitlist = {
  id: string; lesson_id: string; profile_id: string; student_id: string | null; joined_at: string;
};

const COACH_EMAIL = "alysemcormier@gmail.com";

function AdminPage() {
  const navigate = useNavigate();
  const { user, isCoach, loading } = useAuth();
  const [tab, setTab] = useState("calendar");

  // Strict guard: must be authenticated AS the owner coach AND have the coach role.
  // Anyone else gets signed out and bounced to /login — even by guessing the URL.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const emailOk = user.email?.toLowerCase() === COACH_EMAIL;
    if (!emailOk || !isCoach) {
      supabase.auth.signOut().finally(() => navigate({ to: "/login" }));
    }
  }, [loading, user, isCoach, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (user.email?.toLowerCase() !== COACH_EMAIL || !isCoach) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-lg">🎾</div>
            <div>
              <div className="text-sm font-bold leading-tight">Ace Tennis</div>
              <div className="text-xs text-muted-foreground">Coach Dashboard</div>
            </div>
          </Link>
          <Button
            variant="ghost" size="sm"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:max-w-xl">
            <TabsTrigger value="calendar"><CalIcon className="mr-2 h-4 w-4" />Calendar</TabsTrigger>
            <TabsTrigger value="roster"><Users className="mr-2 h-4 w-4" />Roster</TabsTrigger>
            <TabsTrigger value="waitlist"><ListTodo className="mr-2 h-4 w-4" />Waitlist</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar"><CalendarTab /></TabsContent>
          <TabsContent value="roster"><RosterTab /></TabsContent>
          <TabsContent value="waitlist"><WaitlistTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- CALENDAR */

function CalendarTab() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [weatherTarget, setWeatherTarget] = useState<Lesson | null>(null);

  async function load() {
    const { data } = await supabase.from("lessons").select("*").order("start_time");
    setLessons((data ?? []) as Lesson[]);
  }
  useEffect(() => { load(); }, []);

  const lessonDates = useMemo(
    () => lessons.map((l) => new Date(l.start_time)),
    [lessons]
  );

  const dayLessons = useMemo(() => {
    if (!selectedDate) return [];
    const d = selectedDate.toDateString();
    return lessons.filter((l) => new Date(l.start_time).toDateString() === d);
  }, [lessons, selectedDate]);

  return (
    <div className="space-y-6">
      <LessonScheduleSettings lessons={lessons} />
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <Card className="p-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={{ hasLesson: lessonDates }}
          modifiersClassNames={{
            hasLesson: "font-bold relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
          }}
        />
        <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="mt-3 w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add session
        </Button>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <p className="text-sm text-muted-foreground">{dayLessons.length} lesson{dayLessons.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        {dayLessons.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No lessons scheduled.</div>
        ) : (
          <div className="space-y-2">
            {dayLessons.map((l) => (
              <div
                key={l.id}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:border-primary hover:bg-secondary/60"
              >
                <button
                  onClick={() => setOpenLesson(l)}
                  className="flex-1 text-left"
                >
                  <div className="font-semibold">{l.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />
                      {fmtTime(l.start_time)} – {fmtTime(l.end_time)}
                    </span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Cap {l.capacity}</span>
                    <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />${Number(l.price).toFixed(0)}</span>
                    {l.lesson_type && (
                      <Badge variant="outline" className="text-[10px]">{presetByType(l.lesson_type)?.label ?? l.lesson_type}</Badge>
                    )}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Cancel session due to weather"
                  aria-label="Cancel session due to weather"
                  onClick={(e) => { e.stopPropagation(); setWeatherTarget(l); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <CloudRainWind className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <LessonDialog
        lesson={openLesson}
        onClose={() => setOpenLesson(null)}
        onChanged={(updated) => { load(); if (updated) setOpenLesson(updated); }}
        onDeleted={() => { load(); setOpenLesson(null); }}
      />
      <AddSessionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultDate={selectedDate ?? new Date()}
        onCreated={() => { load(); setAddOpen(false); }}
      />
      <WeatherCancelDialog
        lesson={weatherTarget}
        onClose={() => setWeatherTarget(null)}
        onDone={() => { setWeatherTarget(null); load(); }}
      />
    </div>
    </div>
  );
}

function LessonScheduleSettings({ lessons }: { lessons: Lesson[] }) {
  const [activeWeek, setActiveWeek] = useState<Date | null>(null);
  const [previewWeek, setPreviewWeek] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [saving, setSaving] = useState(false);

  async function loadActive() {
    const { data } = await supabase
      .from("app_settings" as never)
      .select("value")
      .eq("key", "active_week_start")
      .maybeSingle();
    const raw = (data as { value?: string } | null)?.value;
    if (typeof raw === "string" && raw) {
      const [y, m, d] = raw.split("-").map(Number);
      if (y && m && d) {
        const wk = new Date(y, m - 1, d);
        setActiveWeek(wk);
        setPreviewWeek(wk);
      }
    }
  }
  useEffect(() => { loadActive(); }, []);

  const previewEnd = new Date(previewWeek);
  previewEnd.setDate(previewEnd.getDate() + 6);
  const previewLessons = lessons
    .filter((l) => {
      const t = new Date(l.start_time).getTime();
      return t >= previewWeek.getTime() && t < previewWeek.getTime() + 7 * 86400000;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  function shift(delta: number) {
    const d = new Date(previewWeek);
    d.setDate(d.getDate() + delta * 7);
    setPreviewWeek(d);
  }

  function fmtRange(start: Date) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const e = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${s} – ${e}`;
  }

  async function setAsActive() {
    setSaving(true);
    const y = previewWeek.getFullYear();
    const m = previewWeek.getMonth() + 1;
    const d = previewWeek.getDate();
    const iso = `${y}-${m < 10 ? "0" : ""}${m}-${d < 10 ? "0" : ""}${d}`;
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key: "active_week_start", value: iso, updated_at: new Date().toISOString() } as never, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setActiveWeek(new Date(previewWeek));
    toast.success(`Active week updated to ${fmtRange(previewWeek)}`);
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Lesson Schedule Settings</h2>
      <div className="mt-2 text-sm">
        <span className="text-muted-foreground">Current Active Week: </span>
        <span className="font-semibold">{activeWeek ? fmtRange(activeWeek) : "—"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => shift(-1)}>← Previous Week</Button>
        <input
          type="date"
          value={`${previewWeek.getFullYear()}-${String(previewWeek.getMonth() + 1).padStart(2, "0")}-${String(previewWeek.getDate()).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m, d] = e.target.value.split("-").map(Number);
            if (y && m && d) {
              const picked = new Date(y, m - 1, d);
              picked.setDate(picked.getDate() - picked.getDay());
              setPreviewWeek(picked);
            }
          }}
          className="h-8 rounded border border-input bg-background px-2 text-xs"
        />
        <span className="text-sm font-medium">{fmtRange(previewWeek)}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => shift(1)}>Next Week →</Button>
      </div>
      <div className="mt-3 rounded-md border border-border p-3">
        <div className="text-xs font-semibold text-muted-foreground">Lessons clients will see this week:</div>
        {previewLessons.length === 0 ? (
          <div className="mt-1 text-xs text-muted-foreground">No lessons in this week.</div>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs">
            {previewLessons.map((l) => {
              const d = new Date(l.start_time);
              const e = new Date(l.end_time);
              return (
                <li key={l.id}>
                  - {l.title} — {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–{e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} — ${Number(l.price).toFixed(0)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Button onClick={setAsActive} disabled={saving} className="mt-3 bg-green-600 text-white hover:bg-green-700">
        {saving ? "Saving…" : "Set as Active Week"}
      </Button>
    </Card>
  );
}

function AddSessionDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: Date;
  onCreated: () => void;
}) {
  const [presetType, setPresetType] = useState<LessonType | "custom">("adult_morning_mix");
  const [dateStr, setDateStr] = useState(toDateInput(props.defaultDate));
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("35");
  const [capacity, setCapacity] = useState("8");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("08:30");
  const [busy, setBusy] = useState(false);

  // When preset changes, prefill the form
  useEffect(() => {
    if (presetType === "custom") return;
    const p = presetByType(presetType);
    if (!p) return;
    setTitle(p.label);
    setPrice(String(p.defaultPrice));
    setCapacity(String(p.capacity));
    setStartTime(`${String(p.startHour).padStart(2, "0")}:${String(p.startMinute).padStart(2, "0")}`);
    setEndTime(`${String(p.endHour).padStart(2, "0")}:${String(p.endMinute).padStart(2, "0")}`);
  }, [presetType]);

  // Update date when dialog opens with a new default
  useEffect(() => {
    if (props.open) setDateStr(toDateInput(props.defaultDate));
  }, [props.open, props.defaultDate]);

  async function submit() {
    const priceNum = Number(price);
    const capNum = parseInt(capacity, 10);
    if (!title.trim() || !dateStr || !startTime || !endTime) {
      toast.error("Fill in all fields");
      return;
    }
    if (!isFinite(priceNum) || priceNum < 0) { toast.error("Invalid price"); return; }
    if (!isFinite(capNum) || capNum < 1) { toast.error("Invalid capacity"); return; }

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const start = new Date(`${dateStr}T00:00:00`);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(`${dateStr}T00:00:00`);
    end.setHours(eh, em, 0, 0);
    if (end <= start) { toast.error("End time must be after start"); return; }

    // Weekday validation for presets
    if (presetType !== "custom") {
      const preset = presetByType(presetType);
      const allowed = preset?.allowedDays;
      if (allowed && allowed.length > 0 && !allowed.includes(start.getDay())) {
        toast.error("This program only runs on Tuesdays and Thursdays.");
        return;
      }
    }

    setBusy(true);
    const { error } = await supabase.from("lessons").insert({
      title: title.trim().slice(0, 200),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      capacity: capNum,
      price: priceNum,
      lesson_type: presetType === "custom" ? null : presetType,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Session added");
    props.onCreated();
  }

  const adultMix = presetType === "adult_morning_mix";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Preset</Label>
            <Select value={presetType} onValueChange={(v) => setPresetType(v as LessonType | "custom")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LESSON_PRESETS.map((p) => (
                  <SelectItem key={p.type} value={p.type}>{p.label}</SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap">Capacity</Label>
              <Input id="cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start time</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End time</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">Price (USD){adultMix && <span className="ml-2 text-xs text-muted-foreground">$35 per person per session</span>}</Label>
            <Input id="price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add session"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeatherCancelDialog(props: {
  lesson: Lesson | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const cancelFn = useServerFn(cancelLessonForWeather);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!props.lesson) return;
    setBusy(true);
    try {
      const res = await cancelFn({ data: { lessonId: props.lesson.id, environment: getStripeEnvironment() } });
      const failures = res.results.filter((r) => r.error).length;
      if (failures > 0) {
        toast.warning(`Canceled ${res.canceledCount} booking${res.canceledCount === 1 ? "" : "s"} — ${failures} had issues. Check logs.`);
      } else {
        toast.success(`Canceled ${res.canceledCount} booking${res.canceledCount === 1 ? "" : "s"}. SMS sent + refunds issued.`);
      }
      props.onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  if (!props.lesson) return null;
  return (
    <Dialog open={!!props.lesson} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudRainWind className="h-5 w-5 text-destructive" />
            Cancel session due to weather
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="font-semibold">{props.lesson.title}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(props.lesson.start_time).toLocaleString(undefined, {
                weekday: "long", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
            </div>
          </div>
          <p>This will:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Cancel every active booking for this session.</li>
            <li>Refund 100% of each paid booking via Stripe.</li>
            <li>Text every registered parent/adult about the cancellation.</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>Keep session</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Canceling…" : "Confirm rain cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}



function LessonDialog({ lesson, onClose, onChanged, onDeleted }: {
  lesson: Lesson | null;
  onClose: () => void;
  onChanged: (updated: Lesson | null) => void;
  onDeleted: () => void;
}) {
  const [bookings, setBookings] = useState<(Booking & { stay_for_match_play?: boolean })[]>([]);
  const [waitlist, setWaitlist] = useState<Waitlist[]>([]);
  const [lessonBookings, setLessonBookings] = useState<Array<{
    id: string;
    participant_id: string;
    account_id: string;
    deposit_status: string;
    is_waitlisted: boolean;
    participant_name: string;
    participant_type: string;
    account_email: string | null;
  }>>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [loading, setLoading] = useState(false);
  const [confirmDeleteLesson, setConfirmDeleteLesson] = useState(false);
  const [confirmRemoveBooking, setConfirmRemoveBooking] = useState<string | null>(null);
  const [confirmMoveFull, setConfirmMoveFull] = useState<Waitlist | null>(null);

  // Edit lesson form
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eDate, setEDate] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eCap, setECap] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Add client search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedAddStudentId, setSelectedAddStudentId] = useState<string | null>(null);
  const [profileStudents, setProfileStudents] = useState<Student[]>([]);
  const [adding, setAdding] = useState(false);

  async function reload(currentLesson: Lesson) {
    setLoading(true);
    const [b, w] = await Promise.all([
      supabase.from("bookings").select("*").eq("lesson_id", currentLesson.id),
      supabase.from("waitlist").select("*").eq("lesson_id", currentLesson.id).order("joined_at"),
    ]);
    const bookingsData = (b.data ?? []) as (Booking & { stay_for_match_play?: boolean })[];
    const waitlistData = (w.data ?? []) as Waitlist[];
    setBookings(bookingsData);
    setWaitlist(waitlistData);

    const profileIds = Array.from(new Set([
      ...bookingsData.map((x) => x.profile_id),
      ...waitlistData.map((x) => x.profile_id),
    ]));
    const studentIds = Array.from(new Set([
      ...bookingsData.map((x) => x.student_id).filter(Boolean),
      ...waitlistData.map((x) => x.student_id).filter(Boolean),
    ] as string[]));

    const [{ data: pData }, { data: sData }] = await Promise.all([
      profileIds.length
        ? supabase.from("profiles").select("*").in("id", profileIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase.from("students").select("*").in("id", studentIds)
        : Promise.resolve({ data: [] }),
    ]);
    setProfiles(Object.fromEntries((pData ?? []).map((p: Profile) => [p.id, p])));
    setStudents(Object.fromEntries((sData ?? []).map((s: Student) => [s.id, s])));
    setLoading(false);
  }

  useEffect(() => {
    if (!lesson) return;
    setEditing(false);
    setSelectedProfile(null);
    setSearch("");
    setSearchResults([]);
    const d = new Date(lesson.start_time);
    const e = new Date(lesson.end_time);
    const pad = (n: number) => String(n).padStart(2, "0");
    setETitle(lesson.title);
    setEDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setEStart(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEEnd(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
    setECap(String(lesson.capacity));
    setEPrice(String(lesson.price));
    reload(lesson);
  }, [lesson]);

  async function refreshLessonRow(currentLesson: Lesson): Promise<Lesson | null> {
    const { data } = await supabase.from("lessons").select("*").eq("id", currentLesson.id).maybeSingle();
    return (data ?? null) as Lesson | null;
  }

  if (!lesson) return null;
  const safeLesson: Lesson = lesson;

  const bookedCount = bookings.length;
  const isAdultMix = lesson.lesson_type === "adult_morning_mix";

  function findDuplicateBooking(profileId: string, studentId: string | null): boolean {
    return bookings.some(
      (b) => b.profile_id === profileId && (b.student_id ?? null) === (studentId ?? null),
    );
  }

  async function handleDeleteLesson() {
    if (!lesson) return;
    const id = safeLesson.id;
    await supabase.from("waitlist").delete().eq("lesson_id", id);
    await supabase.from("bookings").delete().eq("lesson_id", id);
    const { error } = await supabase.from("lessons").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lesson deleted");
    setConfirmDeleteLesson(false);
    onDeleted();
  }

  async function handleRemoveBooking(bookingId: string) {
    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from lesson");
    setConfirmRemoveBooking(null);
    await reload(safeLesson);
    onChanged(safeLesson);
  }

  async function handleSaveEdit() {
    if (!eTitle.trim() || !eDate || !eStart || !eEnd) { toast.error("Fill in all fields"); return; }
    const priceNum = Number(ePrice);
    const capNum = parseInt(eCap, 10);
    if (!isFinite(priceNum) || priceNum < 0) { toast.error("Invalid price"); return; }
    if (!isFinite(capNum) || capNum < 1) { toast.error("Invalid capacity"); return; }
    const [sh, sm] = eStart.split(":").map(Number);
    const [eh, em] = eEnd.split(":").map(Number);
    const start = new Date(`${eDate}T00:00:00`); start.setHours(sh, sm, 0, 0);
    const end = new Date(`${eDate}T00:00:00`); end.setHours(eh, em, 0, 0);
    if (end <= start) { toast.error("End time must be after start"); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("lessons").update({
      title: eTitle.trim().slice(0, 200),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      capacity: capNum,
      price: priceNum,
    }).eq("id", safeLesson.id);
    setSavingEdit(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lesson updated");
    setEditing(false);
    const updated = await refreshLessonRow(safeLesson);
    onChanged(updated);
  }

  async function handleMoveWaitlist(w: Waitlist, force = false) {
    if (bookedCount >= safeLesson.capacity && !force) {
      setConfirmMoveFull(w);
      return;
    }
    if (findDuplicateBooking(w.profile_id, w.student_id)) {
      toast.error("This player is already in this lesson.");
      setConfirmMoveFull(null);
      return;
    }
    const profile = profiles[w.profile_id];
    const { error: insErr } = await supabase.from("bookings").insert({
      lesson_id: safeLesson.id,
      profile_id: w.profile_id,
      student_id: w.student_id,
      payment_status: "pending",
      cancellation_status: "active",
      signed_waiver: profile?.waiver_signed ?? false,
    });
    if (insErr) { toast.error(insErr.message); return; }
    await supabase.from("waitlist").delete().eq("id", w.id);
    toast.success("Moved into lesson");
    setConfirmMoveFull(null);
    await reload(safeLesson);
    onChanged(safeLesson);
  }

  async function setPaymentStatus(bookingId: string, status: string) {
    const { error } = await supabase.from("bookings").update({ payment_status: status }).eq("id", bookingId);
    if (error) { toast.error(error.message); return; }
    await reload(safeLesson);
  }
  async function setWaiverFlag(bookingId: string, signed: boolean) {
    const { error } = await supabase.from("bookings").update({ signed_waiver: signed }).eq("id", bookingId);
    if (error) { toast.error(error.message); return; }
    await reload(safeLesson);
  }

  async function runSearch() {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(10);
    setSearchResults((data ?? []) as Profile[]);
    setSearching(false);
  }

  async function pickProfile(p: Profile) {
    setSelectedProfile(p);
    setSelectedAddStudentId(null);
    const { data } = await supabase.from("students").select("*").eq("parent_id", p.id);
    setProfileStudents((data ?? []) as Student[]);
  }

  async function handleAddClient() {
    if (!selectedProfile) return;
    const studentId = selectedAddStudentId; // null means adult/self
    if (findDuplicateBooking(selectedProfile.id, studentId)) {
      toast.error("This player is already in this lesson.");
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("bookings").insert({
      lesson_id: safeLesson.id,
      profile_id: selectedProfile.id,
      student_id: studentId,
      payment_status: "pending",
      cancellation_status: "active",
      signed_waiver: selectedProfile.waiver_signed ?? false,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Client added to lesson");
    setSelectedProfile(null);
    setSearch("");
    setSearchResults([]);
    setProfileStudents([]);
    await reload(safeLesson);
    onChanged(safeLesson);
  }

  const matchPlayNames = isAdultMix
    ? bookings
        .filter((b) => b.stay_for_match_play === true)
        .map((b) => {
          const s = b.student_id ? students[b.student_id] : null;
          const p = profiles[b.profile_id];
          return s?.name ?? p?.full_name ?? null;
        })
        .filter((n): n is string => Boolean(n))
    : [];

  return (
    <Dialog open={!!lesson} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{lesson.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {new Date(lesson.start_time).toLocaleString(undefined, {
              weekday: "long", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            })} • {bookedCount} / {safeLesson.capacity} booked · {waitlist.length} waitlisted
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-6">
            {/* Edit lesson */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Lesson details
                </h3>
                <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Cancel edit" : "Edit"}
                </Button>
              </div>
              {editing && (
                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-title">Title</Label>
                    <Input id="e-title" value={eTitle} onChange={(e) => setETitle(e.target.value)} maxLength={200} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e-date">Date</Label>
                      <Input id="e-date" type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-cap">Capacity</Label>
                      <Input id="e-cap" type="number" min={1} value={eCap} onChange={(e) => setECap(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e-start">Start</Label>
                      <Input id="e-start" type="time" value={eStart} onChange={(e) => setEStart(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-end">End</Label>
                      <Input id="e-end" type="time" value={eEnd} onChange={(e) => setEEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-price">Price (USD)</Label>
                    <Input id="e-price" type="number" min={0} step="0.01" value={ePrice} onChange={(e) => setEPrice(e.target.value)} />
                  </div>
                  <Button onClick={handleSaveEdit} disabled={savingEdit} size="sm">
                    {savingEdit ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}
            </section>

            {isAdultMix && (
              <>
                <Separator />
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Staying for organized match play ({matchPlayNames.length})
                  </h3>
                  {matchPlayNames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody yet.</p>
                  ) : (
                    <p className="text-sm">{matchPlayNames.join(", ")}</p>
                  )}
                </section>
              </>
            )}

            <Separator />

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Attending ({bookings.length})
              </h3>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b) => {
                    const profile = profiles[b.profile_id];
                    const student = b.student_id ? students[b.student_id] : null;
                    const displayName = student?.name ?? profile?.full_name ?? "Unnamed";
                    return (
                      <div key={b.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              {student?.age != null ? `Age ${student.age}` : "Adult"}
                              {profile?.full_name && student && ` • Parent: ${profile.full_name}`}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <PaymentBadge status={b.payment_status} />
                            <WaiverBadge signed={b.signed_waiver || profile?.waiver_signed} />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select value={b.payment_status} onValueChange={(v) => setPaymentStatus(b.id, v)}>
                            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="refunded">Refunded</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={b.signed_waiver ? "signed" : "unsigned"} onValueChange={(v) => setWaiverFlag(b.id, v === "signed")}>
                            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="signed">Waiver signed</SelectItem>
                              <SelectItem value="unsigned">Waiver unsigned</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm" variant="ghost"
                            className="ml-auto text-destructive hover:text-destructive"
                            onClick={() => setConfirmRemoveBooking(b.id)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" /> Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Waitlist ({waitlist.length})
              </h3>
              {waitlist.length === 0 ? (
                <p className="text-sm text-muted-foreground">Empty.</p>
              ) : (
                <ol className="space-y-2">
                  {waitlist.map((w, i) => {
                    const profile = profiles[w.profile_id];
                    const student = w.student_id ? students[w.student_id] : null;
                    return (
                      <li key={w.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {student?.name ?? profile?.full_name ?? "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Joined {new Date(w.joined_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleMoveWaitlist(w)}>
                          Move to lesson
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Add client manually
              </h3>
              {selectedProfile ? (
                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="text-sm">
                    <div className="font-medium">{selectedProfile.full_name ?? "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{selectedProfile.email}</div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Player</Label>
                    <Select
                      value={selectedAddStudentId ?? "__adult"}
                      onValueChange={(v) => setSelectedAddStudentId(v === "__adult" ? null : v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__adult">Adult / self</SelectItem>
                        {profileStudents.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}{s.age != null ? ` (age ${s.age})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddClient} disabled={adding}>
                      {adding ? "Adding…" : "Add to lesson"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedProfile(null); setProfileStudents([]); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search name, email, or phone…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                    />
                    <Button size="sm" variant="outline" onClick={runSearch} disabled={searching}>
                      {searching ? "…" : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {searchResults.length > 0 && (
                    <ul className="space-y-1">
                      {searchResults.map((p) => (
                        <li key={p.id}>
                          <button
                            className="w-full rounded-md border border-border bg-background p-2 text-left hover:bg-secondary/40"
                            onClick={() => pickProfile(p)}
                          >
                            <div className="text-sm font-medium">{p.full_name ?? "Unnamed"}</div>
                            <div className="text-xs text-muted-foreground">{p.email}{p.phone ? ` · ${p.phone}` : ""}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <Separator />

            <section>
              <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteLesson(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete lesson
              </Button>
            </section>
          </div>
        )}

        <AlertDialog open={confirmDeleteLesson} onOpenChange={setConfirmDeleteLesson}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the lesson plus every booking and waitlist entry attached to it.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleDeleteLesson(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete lesson
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmRemoveBooking} onOpenChange={(v) => !v && setConfirmRemoveBooking(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this player from the lesson?</AlertDialogTitle>
              <AlertDialogDescription>The booking will be deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); if (confirmRemoveBooking) handleRemoveBooking(confirmRemoveBooking); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmMoveFull} onOpenChange={(v) => !v && setConfirmMoveFull(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>This lesson is full</AlertDialogTitle>
              <AlertDialogDescription>Move this player anyway?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); if (confirmMoveFull) handleMoveWaitlist(confirmMoveFull, true); }}
              >
                Move anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}


function PaymentBadge({ status }: { status: string }) {
  const paid = status === "paid";
  return (
    <Badge variant={paid ? "default" : "secondary"} className="gap-1">
      <DollarSign className="h-3 w-3" />
      {paid ? "Paid" : status === "pending" ? "Pending" : status}
    </Badge>
  );
}
function WaiverBadge({ signed }: { signed: boolean | undefined }) {
  return (
    <Badge variant={signed ? "default" : "destructive"} className="gap-1">
      <FileSignature className="h-3 w-3" />
      {signed ? "Signed" : "Unsigned"}
    </Badge>
  );
}

/* ------------------------------------------------------------------- ROSTER */

function RosterTab() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);

  async function loadClients() {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setClients((data ?? []) as Profile[]);
  }

  useEffect(() => { loadClients(); }, []);

  const filtered = clients.filter((c) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients..." className="pl-9"
          />
        </div>
        <div className="space-y-1 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No clients.</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full rounded-md p-3 text-left transition-colors ${
                selected?.id === c.id ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.full_name || "Unnamed"}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                </div>
                {c.waiver_signed ? (
                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                ) : (
                  <X className="h-4 w-4 flex-shrink-0 text-destructive" />
                )}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div>
        {selected ? (
          <ClientDetail
            key={selected.id}
            client={selected}
            onDeleted={async () => {
              setSelected(null);
              await loadClients();
            }}
          />
        ) : (
          <Card className="flex h-full min-h-[300px] items-center justify-center p-8 text-sm text-muted-foreground">
            Select a client to view details
          </Card>
        )}
      </div>
    </div>
  );
}


function ClientDetail({ client, onDeleted }: { client: Profile; onDeleted: () => void | Promise<void> }) {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [notes, setNotes] = useState<{ id: string; note: string; created_at: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientLessons, setClientLessons] = useState<
    Array<{
      id: string;
      lesson_name: string;
      lesson_date: string;
      lesson_start_time: string | null;
      lesson_end_time: string | null;
      participant_name: string;
      deposit_status: string;
      cancellation_status: string;
      is_waitlisted: boolean;
    }>
  >([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const runDelete = useServerFn(deleteClientFn);

  async function loadNotes() {
    const { data } = await supabase
      .from("coach_notes").select("id, note, created_at")
      .eq("client_id", client.id).order("created_at", { ascending: false });
    setNotes(data ?? []);
  }

  async function loadLessons() {
    const { data: lbData } = await supabase
      .from("lesson_bookings")
      .select("id, lesson_name, lesson_date, lesson_start_time, lesson_end_time, deposit_status, cancellation_status, participant_id, is_waitlisted")
      .eq("account_id", client.id)
      .order("lesson_date", { ascending: false });
    const rows = (lbData ?? []) as Array<{
      id: string; lesson_name: string; lesson_date: string;
      lesson_start_time: string | null; lesson_end_time: string | null;
      deposit_status: string; cancellation_status: string;
      participant_id: string; is_waitlisted: boolean;
    }>;
    if (rows.length === 0) { setClientLessons([]); return; }
    const partIds = Array.from(new Set(rows.map((r) => r.participant_id)));
    const { data: pData } = await supabase
      .from("participants")
      .select("id, first_name, last_name, is_account_holder")
      .in("id", partIds);
    const pMap: Record<string, { first_name: string; last_name: string; is_account_holder: boolean }> =
      Object.fromEntries(((pData ?? []) as Array<{ id: string; first_name: string; last_name: string; is_account_holder: boolean }>).map((p) => [p.id, p]));
    setClientLessons(rows.map((r) => {
      const p = pMap[r.participant_id];
      const name = p
        ? (p.is_account_holder ? "Account holder" : `${p.first_name} ${p.last_name}`.trim())
        : "Participant";
      return {
        id: r.id,
        lesson_name: r.lesson_name,
        lesson_date: r.lesson_date,
        lesson_start_time: r.lesson_start_time,
        lesson_end_time: r.lesson_end_time,
        participant_name: name,
        deposit_status: r.deposit_status,
        cancellation_status: r.cancellation_status,
        is_waitlisted: r.is_waitlisted,
      };
    }));
  }


  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("students").select("*").eq("parent_id", client.id);
      const studentsList = (data ?? []) as Student[];
      setStudents(studentsList);
      await Promise.all([loadNotes(), loadLessons()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function saveNote() {
    if (!draft.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase.from("coach_notes").insert({
      client_id: client.id, coach_id: user.id, note: draft.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    toast.success("Note saved");
    loadNotes();
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await runDelete({ data: { clientId: client.id } });
      toast.success("Client deleted");
      setConfirmDeleteOpen(false);
      await onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }


  return (
    <Card className="p-5 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{client.full_name || "Unnamed"}</h2>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            <div>{client.email}</div>
            <div>{client.phone || "No phone"}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Waiver</div>
            {client.waiver_signed ? (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                <Check className="h-4 w-4" /> Signed
              </div>
            ) : (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                <X className="h-4 w-4" /> Unsigned
              </div>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete client
          </Button>
        </div>
      </div>

      <Separator />

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Signed-up lessons ({clientLessons.length})
        </h3>
        {clientLessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <div className="space-y-2">
            {clientLessons.map((row) => {
              const start = row.lesson_start_time
                ? new Date(`${row.lesson_date}T${row.lesson_start_time}`)
                : new Date(row.lesson_date);
              return (
                <div key={row.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{row.lesson_name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalIcon className="h-3 w-3" />
                          {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        {row.lesson_start_time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {row.lesson_start_time.slice(0, 5)}
                            {row.lesson_end_time ? ` – ${row.lesson_end_time.slice(0, 5)}` : ""}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {row.participant_name}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {row.is_waitlisted ? (
                        <Badge variant="secondary">Waitlisted</Badge>
                      ) : (
                        <Badge
                          variant={row.deposit_status === "Paid" ? "default" : "secondary"}
                          className={row.deposit_status === "Confirmed" ? "bg-emerald-600 text-white hover:bg-emerald-600" : undefined}
                        >
                          {row.deposit_status}
                        </Badge>
                      )}
                      {row.cancellation_status !== "Active" && (
                        <Badge variant="destructive">{row.cancellation_status}</Badge>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Children ({students.length})
        </h3>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">No children registered.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {students.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.age != null ? `Age ${s.age}` : "—"}{s.gender ? ` • ${s.gender}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>


      <Separator />

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Coach notes
        </h3>
        <div className="space-y-2">
          <Textarea
            value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note about this client..."
            rows={3} maxLength={2000}
          />
          <Button onClick={saveNote} disabled={!draft.trim() || saving} size="sm">
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-border bg-background p-3">
                <div className="whitespace-pre-wrap text-sm">{n.note}</div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={(v) => !deleting && setConfirmDeleteOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this client?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{client.full_name || client.email || "this client"}</strong>{" "}
              and all of their bookings, waitlist entries, coach notes, and registered children.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}


/* ----------------------------------------------------------------- WAITLIST */

function WaitlistTab() {
  const [items, setItems] = useState<
    { lesson: Lesson; bookedCount: number; entries: (Waitlist & { profile?: Profile; student?: Student })[] }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: lessons }, { data: bookings }, { data: waitlist }] = await Promise.all([
        supabase.from("lessons").select("*").order("start_time"),
        supabase.from("bookings").select("lesson_id"),
        supabase.from("waitlist").select("*").order("joined_at"),
      ]);

      const bookCounts: Record<string, number> = {};
      (bookings ?? []).forEach((b: { lesson_id: string }) => {
        bookCounts[b.lesson_id] = (bookCounts[b.lesson_id] ?? 0) + 1;
      });

      const fullLessons = (lessons ?? []).filter(
        (l: Lesson) => (bookCounts[l.id] ?? 0) >= l.capacity
      );

      const wlByLesson: Record<string, Waitlist[]> = {};
      (waitlist ?? []).forEach((w: Waitlist) => {
        (wlByLesson[w.lesson_id] ??= []).push(w);
      });

      const profileIds = Array.from(new Set((waitlist ?? []).map((w: Waitlist) => w.profile_id)));
      const studentIds = Array.from(new Set(
        (waitlist ?? []).map((w: Waitlist) => w.student_id).filter(Boolean) as string[]
      ));

      const [{ data: profiles }, { data: students }] = await Promise.all([
        profileIds.length ? supabase.from("profiles").select("*").in("id", profileIds) : Promise.resolve({ data: [] }),
        studentIds.length ? supabase.from("students").select("*").in("id", studentIds) : Promise.resolve({ data: [] }),
      ]);
      const pMap = Object.fromEntries((profiles ?? []).map((p: Profile) => [p.id, p]));
      const sMap = Object.fromEntries((students ?? []).map((s: Student) => [s.id, s]));

      setItems(
        fullLessons.map((lesson: Lesson) => ({
          lesson,
          bookedCount: bookCounts[lesson.id] ?? 0,
          entries: (wlByLesson[lesson.id] ?? []).map((w) => ({
            ...w,
            profile: pMap[w.profile_id],
            student: w.student_id ? sMap[w.student_id] : undefined,
          })),
        }))
      );
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading waitlists…</Card>;
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <ListTodo className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 font-semibold">No lessons at capacity</h3>
        <p className="mt-1 text-sm text-muted-foreground">All scheduled lessons still have open spots.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map(({ lesson, bookedCount, entries }) => (
        <Card key={lesson.id} className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{lesson.title}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalIcon className="h-3 w-3" />
                  {new Date(lesson.start_time).toLocaleString(undefined, {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}
                </span>
                <Badge variant="destructive">Full · {bookedCount}/{lesson.capacity}</Badge>
              </div>
            </div>
            <Badge variant="secondary">{entries.length} waiting</Badge>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody on the waitlist.</p>
          ) : (
            <ol className="space-y-2">
              {entries.map((e, i) => (
                <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      {e.student?.name ?? e.profile?.full_name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.profile?.email} • Joined {new Date(e.joined_at).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- UTILS */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
