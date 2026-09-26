import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  Dumbbell,
  HeartPulse,
  LogIn,
  Music2,
  UserPlus,
  UserRound,
} from 'lucide-react';

const worlds = [
  {
    name: 'VFit',
    promise: 'Train anywhere',
    text: 'Book gyms, classes, virtual sessions and personal trainers without switching apps.',
    href: '/fit/classes',
    icon: Dumbbell,
    accent: 'from-[#00C9FF] to-[#0066FF]',
    panel: 'bg-[#071B2D]',
  },
  {
    name: 'VFun',
    promise: 'Move with people',
    text: 'Discover active events, parties, VR experiences and social moments built around movement.',
    href: '/fun/events',
    icon: Music2,
    accent: 'from-[#B461FF] to-[#FF00E5]',
    panel: 'bg-[#251137]',
  },
  {
    name: 'VLife',
    promise: 'Feel better daily',
    text: 'Find wellness, recovery and lifestyle services that fit into real routines.',
    href: '/life/home-services',
    icon: HeartPulse,
    accent: 'from-[#00E676] to-[#FFD600]',
    panel: 'bg-[#0D281E]',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0F121B] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0F121B]/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="VFitFunLife home">
            <Image
              src="/icons/icon-192x192.png"
              alt=""
              width={36}
              height={36}
              priority
              className="h-9 w-9 rounded-lg"
            />
            <span className="font-display text-lg font-bold">VFitFunLife</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold text-white/80 transition hover:text-white"
            >
              <LogIn className="h-4 w-4" />
              Log in
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#111827] transition hover:bg-white/90"
            >
              <UserPlus className="h-4 w-4" />
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative flex min-h-screen items-center overflow-hidden pt-16">
        <div className="absolute inset-0 grid grid-cols-1 opacity-80 md:grid-cols-3" aria-hidden="true">
          {worlds.map((world) => (
            <div key={world.name} className={`${world.panel} min-h-32`} />
          ))}
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,18,27,0.96)_0%,rgba(15,18,27,0.48)_44%,rgba(15,18,27,0.82)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,#0F121B_0%,rgba(15,18,27,0)_100%)]" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-md border border-white/15 bg-black/25 px-3 py-2">
              <Image
                src="/icons/icon-192x192.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md"
              />
              <span className="text-sm font-semibold text-white/80">One account. Three ways to live well.</span>
            </div>

            <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-7xl lg:text-8xl">
              VFitFunLife
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl">
              The marketplace where customers find fitness, events and wellness services, and
              providers turn their calendar into bookable work.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register?as=customer"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-white px-6 text-base font-bold text-[#111827] transition hover:bg-white/90"
              >
                <UserRound className="h-5 w-5" />
                Register as a customer
              </Link>
              <Link
                href="/auth/register?as=provider"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-white/30 bg-white/10 px-6 text-base font-bold text-white transition hover:bg-white/15"
              >
                <BriefcaseBusiness className="h-5 w-5" />
                Register as a provider
              </Link>
            </div>
          </div>

          <div className="grid gap-3 self-end lg:pt-28">
            {worlds.map((world) => {
              const Icon = world.icon;
              return (
                <Link
                  key={world.name}
                  href={world.href}
                  className="group block rounded-md border border-white/12 bg-black/28 p-4 backdrop-blur-sm transition hover:border-white/28 hover:bg-black/36"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${world.accent}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-2xl font-bold">{world.name}</h2>
                        <ArrowRight className="h-4 w-4 text-white/50 transition group-hover:translate-x-1 group-hover:text-white" />
                      </div>
                      <span className="mt-1 block text-sm font-semibold text-white/82">{world.promise}</span>
                      <span className="mt-2 block text-sm leading-6 text-white/62">{world.text}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0F121B] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          <p className="text-sm leading-6 text-white/68">
            Customers can compare services, save preferences and book across fitness, fun and
            wellness from one place.
          </p>
          <p className="text-sm leading-6 text-white/68">
            Providers can apply with their service categories and start building a bookable
            profile after approval.
          </p>
          <p className="text-sm leading-6 text-white/68">
            Already part of the pilot? Use the menu to log in and continue from your dashboard.
          </p>
        </div>
      </section>
    </main>
  );
}
