'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  LogIn,
  MapPin,
  MessageCircle,
  Music2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserPlus,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useI18n } from '@/hooks/useI18n';
import { landingCopy } from '@/i18n/landing';

const worldMeta = {
  VFit: { href: '/fit/classes', icon: Dumbbell, color: 'from-[#00C9FF] to-[#0066FF]', surface: 'bg-[#EAF8FF]', textColor: 'text-[#0056D6]' },
  VFun: { href: '/fun/events', icon: Music2, color: 'from-[#B461FF] to-[#FF00E5]', surface: 'bg-[#F8ECFF]', textColor: 'text-[#8A22D5]' },
  VLife: { href: '/life/home-services', icon: HeartPulse, color: 'from-[#00E676] to-[#FFD600]', surface: 'bg-[#ECFFF4]', textColor: 'text-[#047D43]' },
} as const;

const stepIcons = [Search, CalendarCheck, Bell];
const providerIcons = [SlidersHorizontal, ShieldCheck, WalletCards];
const featureIcons = [MapPin, MessageCircle, Star, WalletCards];

function BrandMark({ compact = false, idSuffix }: { compact?: boolean; idSuffix: string }) {
  const gradientId = `vfit-logo-${idSuffix}`;

  return (
    <span className="inline-flex items-center gap-3">
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-md bg-white shadow-[0_14px_35px_rgba(87,120,255,0.18)] ${
          compact ? 'h-9 w-9' : 'h-12 w-12'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 80 80" className={compact ? 'h-7 w-7' : 'h-9 w-9'}>
          <defs>
            <linearGradient id={gradientId} x1="12" x2="68" y1="18" y2="66">
              <stop stopColor="#7B61FF" />
              <stop offset="0.46" stopColor="#00C9FF" />
              <stop offset="1" stopColor="#00E676" />
            </linearGradient>
          </defs>
          <path
            d="M17 21L40 64L63 21"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="8"
          />
          <path
            d="M30 22L40 43L50 22"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
            opacity="0.58"
          />
        </svg>
      </span>
      <span className={compact ? 'font-display text-lg font-black text-[#111827]' : 'font-display text-3xl font-black text-[#111827] sm:text-4xl'}>
        Vfitfunlife
      </span>
    </span>
  );
}

export default function LandingPage() {
  const { locale } = useI18n();
  const copy = landingCopy[locale];
  const worlds = copy.worlds.map((world) => ({ ...world, ...worldMeta[world.name] }));
  const customerSteps = copy.customerSteps.map((step, index) => ({ ...step, icon: stepIcons[index] }));
  const providerSteps = copy.providerSteps.map((step, index) => ({ ...step, icon: providerIcons[index] }));
  const stats = ['3', '1', '+39'].map((value, index) => ({ value, label: copy.stats[index] }));

  return (
    <main className="landing-page min-h-screen bg-[#F6FAFF] text-[#111827]">
      <header className="landing-light-surface sticky top-0 z-40 border-b border-[#DCE8F7] bg-white/95 backdrop-blur-md">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={copy.homeLabel}>
            <BrandMark compact idSuffix="nav" />
          </Link>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="menu" />
            <ThemeToggle compact />
            <Link
              href="/auth/login"
              className="inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold text-[#475569] transition hover:text-[#111827]"
            >
              <LogIn className="h-4 w-4" />
              {copy.login}
            </Link>
            <Link
              href="/auth/register"
              className="landing-header-cta inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-bold text-white transition"
            >
              <UserPlus className="h-4 w-4" />
              {copy.signUp}
            </Link>
          </div>
        </nav>
      </header>

      <section className="landing-light-surface relative overflow-hidden border-b border-[#DCE8F7] bg-white">
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[0.94fr_1.06fr] lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-7">
              <BrandMark idSuffix="hero" />
              <p className="mt-3 text-sm font-bold text-[#697386]">{copy.tagline}</p>
            </div>

            <h1 className="max-w-3xl font-display text-5xl font-black leading-[0.98] text-[#111827] sm:text-6xl lg:text-7xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#475569] sm:text-xl">
              {copy.heroText}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register?as=customer"
                className="landing-cta landing-cta-customer inline-flex min-h-14 items-center justify-center gap-3 rounded-md px-6 text-base font-bold text-white transition"
              >
                <UserRound className="h-5 w-5" />
                {copy.registerCustomer}
              </Link>
              <Link
                href="/auth/register?as=provider"
                className="landing-cta landing-cta-provider inline-flex min-h-14 items-center justify-center gap-3 rounded-md border px-6 text-base font-bold transition"
              >
                <BriefcaseBusiness className="h-5 w-5" />
                {copy.registerProvider}
              </Link>
            </div>

            <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="border-l border-[#CBD5E1] pl-4">
                  <dt className="font-display text-3xl font-black text-[#111827]">{stat.value}</dt>
                  <dd className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative min-h-[560px] lg:min-h-[650px]" aria-label="Vfitfunlife app preview">
            <div className="absolute left-[2%] top-10 w-[48%] overflow-hidden rounded-[2rem] border border-[#DCE5F2] bg-[#F8FAFC] shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
              <Image
                src="/landing/home.png"
                alt="Vfitfunlife home screen showing the VFit hub"
                width={414}
                height={896}
                priority
                className="h-auto w-full"
              />
            </div>
            <div className="absolute right-[1%] top-0 w-[47%] overflow-hidden rounded-[2rem] border border-[#111827] bg-[#111827] shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
              <Image
                src="/landing/booking.png"
                alt="Vfitfunlife booking screen with provider search"
                width={414}
                height={896}
                priority
                className="h-auto w-full"
              />
            </div>
            <div className="absolute bottom-6 left-[27%] w-[46%] overflow-hidden rounded-[2rem] border border-[#111827] bg-[#111827] shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
              <Image
                src="/landing/trainer.png"
                alt="Vfitfunlife provider profile and booking screen"
                width={414}
                height={896}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-light-surface border-y border-[#DCE8F7] bg-[#F0F8FF] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-black text-[#111827] sm:text-4xl">
              {copy.worldsTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-[#475569]">
              {copy.worldsText}
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {worlds.map((world) => {
              const Icon = world.icon;
              return (
                <Link
                  key={world.name}
                  href={world.href}
                  className={`landing-world-card group rounded-md border ${world.surface} p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(15,23,42,0.12)]`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-md bg-gradient-to-br ${world.color}`}>
                      <Icon className="h-6 w-6 text-white" />
                    </span>
                    <ArrowRight className="h-5 w-5 text-[#64748B] transition group-hover:translate-x-1 group-hover:text-[#111827]" />
                  </div>
                  <h2 className="mt-6 font-display text-3xl font-black text-[#111827]">{world.name}</h2>
                  <p className={`mt-1 text-sm font-bold ${world.textColor}`}>{world.label}</p>
                  <p className="mt-4 text-sm leading-6 text-[#334155]">{world.text}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {world.items.map((item) => (
                      <span key={item} className="landing-world-tag rounded-md bg-white/80 px-3 py-1 text-xs font-bold text-[#334155]">
                        {item}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-light-surface relative bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[#EAF8FF] px-3 py-2 text-sm font-bold text-[#0056D6]">
              <Sparkles className="h-4 w-4" />
              {copy.customerBadge}
            </div>
            <h2 className="mt-5 font-display text-3xl font-black text-[#111827] sm:text-4xl">{copy.customerTitle}</h2>
            <p className="mt-4 text-base leading-7 text-[#475569]">
              {copy.customerText}
            </p>
            <Link
              href="/auth/register?as=customer"
              className="landing-cta landing-cta-customer mt-6 inline-flex min-h-12 items-center gap-2 rounded-md px-5 text-sm font-bold text-white transition"
            >
              {copy.customerCta}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {customerSteps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-5">
                  <Icon className="h-6 w-6 text-[#0066FF]" />
                  <h3 className="mt-5 text-lg font-black text-[#111827]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#475569]">{step.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-provider-band border-y px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-4 md:grid-cols-3">
            {providerSteps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="rounded-md border border-white/12 bg-white/[0.07] p-5">
                  <Icon className="h-6 w-6 text-[#00C9FF]" />
                  <h3 className="mt-5 text-lg font-black text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/70">{step.text}</p>
                </article>
              );
            })}
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-bold text-[#00E676]">
              <BadgeCheck className="h-4 w-4" />
              {copy.providerBadge}
            </div>
            <h2 className="mt-5 font-display text-3xl font-black text-white sm:text-4xl">{copy.providerTitle}</h2>
            <p className="mt-4 text-base leading-7 text-white/70">
              {copy.providerText}
            </p>
            <Link
              href="/auth/register?as=provider"
              className="landing-cta landing-cta-provider mt-6 inline-flex min-h-12 items-center gap-2 rounded-md px-5 text-sm font-bold transition"
            >
              {copy.providerCta}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-light-surface bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-black text-[#111827] sm:text-4xl">
              {copy.aroundTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-[#475569]">
              {copy.aroundText}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {copy.features.map((item, index) => {
              const Icon = featureIcons[index];
              return (
                <article key={item.title} className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-5">
                  <Icon className="h-5 w-5 text-[#7B61FF]" />
                  <h3 className="mt-4 text-base font-black text-[#111827]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#475569]">{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-light-surface bg-[#F0F8FF] px-4 py-14 sm:px-6 lg:px-8">
        <div className="landing-light-surface mx-auto flex max-w-7xl flex-col gap-6 rounded-md border border-[#E5E7EB] bg-white p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <BrandMark compact idSuffix="footer" />
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#475569]">
              {copy.footerText}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/register?as=customer"
              className="landing-cta landing-cta-customer inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold text-white transition"
            >
              <UserRound className="h-4 w-4" />
              {copy.registerCustomer}
            </Link>
            <Link
              href="/auth/register?as=provider"
              className="landing-cta landing-cta-provider inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-5 text-sm font-bold transition"
            >
              <BriefcaseBusiness className="h-4 w-4" />
              {copy.registerProvider}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
