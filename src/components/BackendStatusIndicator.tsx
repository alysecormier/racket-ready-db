import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Status = "checking" | "online" | "offline";

type LastWrite = {
  participantName: string | null;
  lessonName: string | null;
  createdAt: string;
} | null;

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BackendStatusIndicator() {
  const [status, setStatus] = useState<Status>("checking");
  const [lastWrite, setLastWrite] = useState<LastWrite>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  async function check() {
    setStatus("checking");
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("lesson_bookings")
        .select("created_at, lesson_name, participants(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(1);
      if (qErr) throw qErr;
      setStatus("online");
      const row = data?.[0] as
        | { created_at: string; lesson_name: string | null; participants: { first_name: string | null; last_name: string | null } | null }
        | undefined;
      if (row) {
        const p = row.participants;
        const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : null;
        setLastWrite({
          participantName: name || null,
          lessonName: row.lesson_name,
          createdAt: row.created_at,
        });
      } else {
        setLastWrite(null);
      }
    } catch (e) {
      setStatus("offline");
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }

  useEffect(() => {
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const dotColor =
    status === "online"
      ? "bg-green-500"
      : status === "offline"
        ? "bg-red-500"
        : "bg-amber-500 animate-pulse";

  const label =
    status === "online" ? "Backend connected" : status === "offline" ? "Backend offline" : "Checking…";

  return (
    <div className="fixed bottom-4 right-4 z-[1000] font-sans text-xs">
      {open && (
        <div className="mb-2 w-72 rounded-lg border border-border bg-background p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-foreground">Backend status</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              <span className="text-foreground">{label}</span>
            </div>
            {error && <div className="text-red-500 break-words">{error}</div>}
            <div className="border-t border-border pt-2">
              <div className="text-muted-foreground">Last onboarding write</div>
              {lastWrite ? (
                <div className="mt-1 text-foreground">
                  <div className="font-medium">{lastWrite.participantName ?? "Unknown participant"}</div>
                  {lastWrite.lessonName && <div className="text-muted-foreground">{lastWrite.lessonName}</div>}
                  <div className="text-muted-foreground">{formatRelative(lastWrite.createdAt)}</div>
                </div>
              ) : (
                <div className="mt-1 text-muted-foreground">No writes recorded yet</div>
              )}
            </div>
            <button
              onClick={check}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-accent"
            >
              Re-check now
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-md hover:bg-accent"
        title={label}
      >
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-foreground">{label}</span>
      </button>
    </div>
  );
}
