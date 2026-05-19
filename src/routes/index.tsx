import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/tennis-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Summer 2026 Tennis Lessons — Alyse's Tennis Camp" },
      { name: "description", content: "Sign up for Summer 2026 tennis lessons and camps." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={heroImage}
        alt="Cartoon tennis ball mascot playing on a tennis court"
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-background/85 via-background/40 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-10 sm:px-10 sm:py-16">
        <header className="flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground/80">
          <span className="text-xl">🎾</span> Alyse's Tennis Camp
        </header>

        <section className="max-w-3xl">
          <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-8xl">
            Welcome to <span className="block">Summer 2026</span>
            <span className="block">Tennis Lessons</span>
          </h1>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link to="/onboarding">
              <Button size="lg" className="w-full px-10 py-6 text-base sm:w-auto">
                Client Portal
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="w-full bg-background/80 px-10 py-6 text-base backdrop-blur-sm sm:w-auto"
              >
                Coach Portal
              </Button>
            </Link>
          </div>
        </section>

        <footer className="text-xs text-foreground/60" />
      </div>
    </main>
  );
}
