'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SplashScreen } from '@/components/screens/SplashScreen';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!loading && !showSplash) {
      const hasOnboarded = localStorage.getItem('hasOnboarded');

      if (!hasOnboarded) {
        router.push('/onboarding');
      } else if (!user) {
        router.push('/auth/login');
      } else {
        router.push('/home');
      }
    }
  }, [user, loading, showSplash, router]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">
        <span className="text-2xl font-display font-bold bg-gradient-to-r from-vfit-primary via-vfun-primary to-vlife-primary bg-clip-text text-transparent">
          Loading...
        </span>
      </div>
    </div>
  );
}
