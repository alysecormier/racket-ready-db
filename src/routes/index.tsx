import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ace Tennis Academy — Coaching for every level" },
      { name: "description", content: "Private and group tennis lessons. Sign up in minutes." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-secondary/40 to-background">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
        <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl shadow-lg">🎾</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Ace Tennis Academy
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Pro-level coaching for kids and adults. Book your first lesson in under
          two minutes.
        </p>
        <ul className="mt-6 grid gap-2 text-left text-sm sm:grid-cols-3 sm:gap-4">
          {["Certified coaches", "Group & private", "All skill levels"].map((f) => (
            <li key={f} className="flex items-center gap-2 rounded-md bg-background/60 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> {f}
            </li>
          ))}
        </ul>
        <Link to="/onboarding" className="mt-8 w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto px-8">Get Started</Button>
        </Link>
      </div>
    </main>
  );
}
