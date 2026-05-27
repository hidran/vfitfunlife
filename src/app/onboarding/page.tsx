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
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages/it';

const slideKeys = [
  {
    titleKey: 'onboarding.slide.welcome.title' as MessageKey,
    subtitleKey: 'onboarding.slide.welcome.subtitle' as MessageKey,
    descriptionKey: 'onboarding.slide.welcome.description' as MessageKey,
    icon: Star,
    theme: 'default' as const,
    featureKeys: [
      { icon: Dumbbell, labelKey: 'onboarding.slide.welcome.feature.gyms' as MessageKey },
      { icon: PartyPopper, labelKey: 'onboarding.slide.welcome.feature.events' as MessageKey },
      { icon: Sparkles, labelKey: 'onboarding.slide.welcome.feature.wellness' as MessageKey },
      { icon: Users, labelKey: 'onboarding.slide.welcome.feature.community' as MessageKey },
    ],
  },
  {
    titleKey: 'onboarding.slide.vfit.title' as MessageKey,
    subtitleKey: 'onboarding.slide.vfit.subtitle' as MessageKey,
    descriptionKey: 'onboarding.slide.vfit.description' as MessageKey,
    icon: Dumbbell,
    theme: 'vfit' as const,
    featureKeys: [
      { icon: Dumbbell, labelKey: 'onboarding.slide.vfit.feature.checkin' as MessageKey },
      { icon: Users, labelKey: 'onboarding.slide.vfit.feature.trainers' as MessageKey },
      { icon: Star, labelKey: 'onboarding.slide.vfit.feature.classes' as MessageKey },
      { icon: Wand2, labelKey: 'onboarding.slide.vfit.feature.challenges' as MessageKey },
    ],
  },
  {
    titleKey: 'onboarding.slide.vfun.title' as MessageKey,
    subtitleKey: 'onboarding.slide.vfun.subtitle' as MessageKey,
    descriptionKey: 'onboarding.slide.vfun.description' as MessageKey,
    icon: PartyPopper,
    theme: 'vfun' as const,
    featureKeys: [
      { icon: PartyPopper, labelKey: 'onboarding.slide.vfun.feature.live' as MessageKey },
      { icon: Star, labelKey: 'onboarding.slide.vfun.feature.vip' as MessageKey },
      { icon: Users, labelKey: 'onboarding.slide.vfun.feature.social' as MessageKey },
      { icon: Wand2, labelKey: 'onboarding.slide.vfun.feature.vr' as MessageKey },
    ],
  },
  {
    titleKey: 'onboarding.slide.vlife.title' as MessageKey,
    subtitleKey: 'onboarding.slide.vlife.subtitle' as MessageKey,
    descriptionKey: 'onboarding.slide.vlife.description' as MessageKey,
    icon: Sparkles,
    theme: 'vlife' as const,
    featureKeys: [
      { icon: Sparkles, labelKey: 'onboarding.slide.vlife.feature.spa' as MessageKey },
      { icon: Users, labelKey: 'onboarding.slide.vlife.feature.pros' as MessageKey },
      { icon: Star, labelKey: 'onboarding.slide.vlife.feature.reviews' as MessageKey },
      { icon: Wand2, labelKey: 'onboarding.slide.vlife.feature.home' as MessageKey },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = slideKeys.map((sk) => ({
    title: t(sk.titleKey),
    subtitle: t(sk.subtitleKey),
    description: t(sk.descriptionKey),
    icon: sk.icon,
    theme: sk.theme,
    features: sk.featureKeys.map((fk) => ({ icon: fk.icon, label: t(fk.labelKey) })),
  }));

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
          {t('onboarding.label')}
        </span>
        <button
          type="button"
          onClick={handleComplete}
          className="text-sm font-semibold text-text-tertiary hover:text-text-inverse"
        >
          {t('onboarding.skip')}
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
              aria-label={t('onboarding.goToSlide', { index: index + 1 })}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="w-full rounded-full bg-section-primary text-background-dark py-3 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
