'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Dumbbell,
  PartyPopper,
  Sparkles,
  Star,
  Users,
  Wand2,
} from 'lucide-react';
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide';
import { cn } from '@/lib/utils';

const slides = [
  {
    title: 'Benvenuto in VFit',
    subtitle: 'Connect - Train - Transform',
    description:
      "Un solo hub per fitness, eventi e wellness. Tutto quello che ami, in un'unica app.",
    icon: Star,
    theme: 'default' as const,
    features: [
      { icon: Dumbbell, label: 'Palestre e corsi' },
      { icon: PartyPopper, label: 'Eventi esclusivi' },
      { icon: Sparkles, label: 'Wellness premium' },
      { icon: Users, label: 'Community attiva' },
    ],
  },
  {
    title: 'VFit',
    subtitle: 'Fitness on demand',
    description:
      'Prenota palestre, corsi e personal trainer. Sfide, progressi e mappe a portata di tap.',
    icon: Dumbbell,
    theme: 'vfit' as const,
    features: [
      { icon: Dumbbell, label: 'Check-in rapido' },
      { icon: Users, label: 'Trainer top' },
      { icon: Star, label: 'Classi premium' },
      { icon: Wand2, label: 'Sfide smart' },
    ],
  },
  {
    title: 'VFun',
    subtitle: 'Eventi e streaming',
    description:
      'Scopri party, VR experience e live streaming. Sempre qualcosa di nuovo da vivere.',
    icon: PartyPopper,
    theme: 'vfun' as const,
    features: [
      { icon: PartyPopper, label: 'Eventi live' },
      { icon: Star, label: 'VIP access' },
      { icon: Users, label: 'Social vibe' },
      { icon: Wand2, label: 'VR moments' },
    ],
  },
  {
    title: 'VLife',
    subtitle: 'Benessere e beauty',
    description:
      'Wellness, estetica e servizi a domicilio. Il tuo momento, quando vuoi.',
    icon: Sparkles,
    theme: 'vlife' as const,
    features: [
      { icon: Sparkles, label: 'Spa & relax' },
      { icon: Users, label: 'Pro certificati' },
      { icon: Star, label: 'Recensioni' },
      { icon: Wand2, label: 'Servizi home' },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);

  const lastIndex = slides.length - 1;
  const isLast = activeIndex === lastIndex;

  const handleComplete = () => {
    try {
      localStorage.setItem('hasOnboarded', 'true');
    } catch (e) {
      // Silently fail if localStorage is unavailable
      console.warn('Failed to save onboarding status');
    }
    router.push('/auth/login');
  };

  const handleNext = () => {
    if (isLast) {
      handleComplete();
      return;
    }
    setActiveIndex((prev) => Math.min(prev + 1, lastIndex));
  };

  const translateX = useMemo(() => `-${activeIndex * 100}%`, [activeIndex]);

  return (
    <div className="min-h-screen bg-background-dark text-text-inverse flex flex-col">
      <div className="container-mobile pt-6 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.3em] text-text-tertiary">
          Onboarding
        </span>
        <button
          type="button"
          onClick={handleComplete}
          className="text-sm font-semibold text-text-tertiary hover:text-text-inverse"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(${translateX})` }}
        >
          {slides.map((slide, index) => (
            <div key={`slide-${index}`} className="min-w-full">
              <OnboardingSlide
                {...slide}
                isActive={index === activeIndex}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="container-mobile pb-10 pt-4 space-y-6">
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                'h-2 rounded-full transition-all',
                index === activeIndex
                  ? 'w-8 bg-section-primary'
                  : 'w-2 bg-white/20'
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="w-full rounded-full bg-section-primary text-background-dark py-3 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {isLast ? 'Get Started' : 'Avanti'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
