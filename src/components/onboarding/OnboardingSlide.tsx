'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface OnboardingSlideProps {
  /** Slide title */
  title: string;
  /** Slide subtitle or tagline */
  subtitle?: string;
  /** Main description text */
  description: string;
  /** Feature list items */
  features?: {
    icon: LucideIcon;
    label: string;
  }[];
  /** Icon to display at the top */
  icon?: LucideIcon;
  /** Theme color scheme */
  theme: 'default' | 'vfit' | 'vfun' | 'vlife';
  /** Custom gradient for the title */
  gradientClass?: string;
  /** Whether this slide is currently active */
  isActive?: boolean;
}

const themeStyles = {
  default: {
    gradient: 'from-vfit-primary via-vfun-primary to-vlife-primary',
    iconBg: 'bg-white/10',
    featureIcon: 'text-white',
    featureBg: 'bg-white/5',
  },
  vfit: {
    gradient: 'from-vfit-primary via-vfit-secondary to-vfit-accent',
    iconBg: 'bg-vfit-primary/20',
    featureIcon: 'text-vfit-primary',
    featureBg: 'bg-vfit-primary/10',
  },
  vfun: {
    gradient: 'from-vfun-primary via-vfun-secondary to-vfun-accent',
    iconBg: 'bg-vfun-primary/20',
    featureIcon: 'text-vfun-primary',
    featureBg: 'bg-vfun-primary/10',
  },
  vlife: {
    gradient: 'from-vlife-primary via-vlife-secondary to-vlife-accent',
    iconBg: 'bg-vlife-primary/20',
    featureIcon: 'text-vlife-primary',
    featureBg: 'bg-vlife-primary/10',
  },
};

export function OnboardingSlide({
  title,
  subtitle,
  description,
  features,
  icon: Icon,
  theme = 'default',
  gradientClass,
  isActive = false,
}: OnboardingSlideProps) {
  const styles = themeStyles[theme];
  const gradientToUse = gradientClass || styles.gradient;

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-8 py-12 text-center">
      {/* Icon */}
      {Icon && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={isActive ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease: 'easeOut' }}
          className={cn(
            'w-24 h-24 rounded-full flex items-center justify-center mb-8',
            styles.iconBg
          )}
        >
          <Icon className={cn('w-12 h-12', styles.featureIcon)} strokeWidth={1.5} />
        </motion.div>
      )}

      {/* Subtitle/Tagline */}
      {subtitle && (
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={isActive ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
          className="text-sm font-medium uppercase tracking-wider text-text-tertiary mb-4"
        >
          {subtitle}
        </motion.p>
      )}

      {/* Title with Gradient */}
      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
        className={cn(
          'font-display font-bold text-3xl sm:text-4xl mb-6 bg-clip-text text-transparent bg-gradient-to-r',
          gradientToUse
        )}
      >
        {title}
      </motion.h2>

      {/* Description */}
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
        transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
        className="text-text-secondary text-base sm:text-lg max-w-sm mb-10 leading-relaxed"
      >
        {description}
      </motion.p>

      {/* Features List */}
      {features && features.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={isActive ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease: 'easeOut' }}
          className="grid grid-cols-2 gap-3 w-full max-w-sm"
        >
          {features.map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <motion.div
                key={feature.label}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={
                  isActive
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0.8, opacity: 0 }
                }
                transition={{
                  delay: 0.35 + index * 0.05,
                  duration: 0.3,
                  ease: 'easeOut',
                }}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl',
                  styles.featureBg
                )}
              >
                <FeatureIcon
                  className={cn('w-5 h-5 flex-shrink-0', styles.featureIcon)}
                  strokeWidth={2}
                />
                <span className="text-sm font-medium text-text-inverse truncate">
                  {feature.label}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
