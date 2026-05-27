'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/hooks/useI18n';

interface SplashScreenProps {
  onComplete: () => void;
}

// Gradient color sets for each vertical
const gradients = {
  vfit: ['#00C9FF', '#0066FF', '#7B61FF'],
  vfun: ['#B461FF', '#FF00E5', '#FF6B9D'],
  vlife: ['#00E676', '#76FF03', '#FFD600'],
};

// Tagline segments with stagger animation
const taglineSegments = ['FIT', 'FUN', 'LIFE'];

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { t } = useI18n();

  // Auto-advance after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  // Handle tap to skip
  const handleTap = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 flex flex-col items-center justify-center bg-background-dark"
        style={{ backgroundColor: '#1A1D29' }}
        onClick={handleTap}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Animated V Logo */}
        <motion.div
          className="relative mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <AnimatedVLogo />
        </motion.div>

        {/* Tagline "FIT . FUN . LIFE" with stagger animation */}
        <div className="flex items-center gap-3 mb-6">
          {taglineSegments.map((segment, index) => (
            <motion.div
              key={segment}
              className="flex items-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.3 + index * 0.15,
                duration: 0.4,
                ease: 'easeOut',
              }}
            >
              <span
                className="font-display text-xl font-bold tracking-wider"
                style={{
                  color:
                    index === 0
                      ? gradients.vfit[0]
                      : index === 1
                        ? gradients.vfun[0]
                        : gradients.vlife[0],
                }}
              >
                {segment}
              </span>
              {index < taglineSegments.length - 1 && (
                <motion.span
                  className="ml-3 text-text-tertiary font-bold"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 + index * 0.15, duration: 0.3 }}
                >
                  .
                </motion.span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Brand tagline "#DOitDIFFERENTLY" */}
        <motion.p
          className="font-display text-sm font-medium tracking-widest text-text-tertiary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          #DOitDIFFERENTLY
        </motion.p>

        {/* Tap to skip hint */}
        <motion.p
          className="absolute bottom-12 text-xs text-text-tertiary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1.2, duration: 0.3 }}
        >
          {t('splash.tapToContinue')}
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}

// Animated V Logo Component with gradient morph effect
function AnimatedVLogo() {
  // Combine all gradient colors for the morph animation cycle
  const allColors = [
    ...gradients.vfit,
    ...gradients.vfun,
    ...gradients.vlife,
    gradients.vfit[0], // Loop back to start
  ];

  return (
    <motion.svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={{
        scale: [1, 1.05, 1, 0.98, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <defs>
        {/* Animated gradient definition */}
        <linearGradient id="vGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <motion.stop
            offset="0%"
            animate={{
              stopColor: allColors,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <motion.stop
            offset="50%"
            animate={{
              stopColor: [...allColors.slice(3), ...allColors.slice(0, 3)],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <motion.stop
            offset="100%"
            animate={{
              stopColor: [...allColors.slice(6), ...allColors.slice(0, 6)],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </linearGradient>

        {/* Glow filter for added visual effect */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle with subtle glow */}
      <motion.circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke="url(#vGradient)"
        strokeWidth="2"
        strokeOpacity="0.3"
        animate={{
          strokeOpacity: [0.2, 0.4, 0.2],
          r: [55, 57, 55],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* The V letter with gradient fill */}
      <motion.path
        d="M30 30 L60 95 L90 30"
        fill="none"
        stroke="url(#vGradient)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: 0.8, ease: 'easeInOut' },
          opacity: { duration: 0.3 },
        }}
      />

      {/* Decorative dot at the bottom of V */}
      <motion.circle
        cx="60"
        cy="95"
        r="4"
        fill="url(#vGradient)"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{
          delay: 0.7,
          duration: 0.4,
          ease: 'easeOut',
        }}
      />
    </motion.svg>
  );
}

export default SplashScreen;
