import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/tennis-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Summer 2026 Tennis Lessons — Alyse's Tennis Camp" },
      { name: "description", content: "Sign up for Summer 2026 tennis lessons and camps with Alyse's Tennis Camp." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1b4332]">
      <img
        src={heroImage}
        alt="Retro tennis court with wooden bench, rackets, and vintage gallery"
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Left-side readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1b4332]/85 via-[#1b4332]/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1b4332]/60 via-transparent to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-6 py-8 sm:px-12 sm:py-12">
        <header className="flex items-center gap-2 text-base font-semibold tracking-wide text-[#f4f1de]">
          <span className="text-2xl">🎾</span>
          <span>Alyse's Tennis Camp</span>
        </header>

        <section className="max-w-3xl">
          <h1 className="font-serif text-[clamp(3rem,8vw,7rem)] font-semibold leading-[0.95] tracking-tight text-[#fdfbf7] drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)]">
            <span className="block">Welcome to</span>
            <span className="block">Summer 2026</span>
            <span className="block">Tennis Lessons</span>
          </h1>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link to="/onboarding">
              <Button
                size="lg"
                className="w-full rounded-md bg-[#2d6a4f] px-10 py-6 text-base font-semibold text-white shadow-lg hover:bg-[#1b4332] sm:w-auto"
              >
                Client Portal
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                className="w-full rounded-md bg-[#f4f1de] px-10 py-6 text-base font-semibold text-[#1a1a1a] shadow-lg hover:bg-[#fdfbf7] sm:w-auto"
              >
                Coach Portal
              </Button>
            </Link>
          </div>
        </section>

        <footer className="text-xs text-[#f4f1de]/60" />
      </div>
    </main>
  );
}
