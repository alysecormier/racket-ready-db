import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Calendar, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBookingBySession } from "@/lib/booking-lookup.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [{ title: "Booking confirmed — Ace Tennis Academy" }],
  }),
  component: CheckoutReturn,
});

type Lesson = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
};

function toICSDate(iso: string): string {
  // YYYYMMDDTHHMMSSZ in UTC
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildGoogleUrl(lesson: Lesson): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: lesson.title,
    dates: `${toICSDate(lesson.start_time)}/${toICSDate(lesson.end_time)}`,
    details: lesson.description ?? "Bring your racket!",
    location: lesson.location ?? "Alyse's Tennis Camp",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildICSDataUri(lesson: Lesson): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alyse Tennis Camp//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${lesson.id}@alysetenniscamp`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(lesson.start_time)}`,
    `DTEND:${toICSDate(lesson.end_time)}`,
    `SUMMARY:${escapeICS(lesson.title)}`,
    `DESCRIPTION:${escapeICS(lesson.description ?? "Bring your racket!")}`,
    `LOCATION:${escapeICS(lesson.location ?? "Alyse's Tennis Camp")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const ics = lines.join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const fetchBooking = useServerFn(getBookingBySession);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    if (!session_id) return;
    let cancelled = false;
    fetchBooking({ data: { sessionId: session_id, environment: getStripeEnvironment() } })
      .then((res) => {
        if (!cancelled && res) setLesson(res as Lesson);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session_id, fetchBooking]);

  const icsFileName = lesson ? `${lesson.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics` : "lesson.ics";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold">Booking confirmed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session_id
            ? "Your lesson is booked. We've emailed you the details."
            : "Payment received."}
        </p>

        {lesson && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="lg">
              <a href={buildGoogleUrl(lesson)} target="_blank" rel="noopener noreferrer">
                <Calendar className="h-4 w-4" />
                Google Calendar
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={buildICSDataUri(lesson)} download={icsFileName}>
                <Apple className="h-4 w-4" />
                Apple Calendar
              </a>
            </Button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button asChild className="w-full" size="lg">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
