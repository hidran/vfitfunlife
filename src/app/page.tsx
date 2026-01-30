'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SplashScreen } from '@/components/screens/SplashScreen';
import { useAuthStore } from '@/stores/authStore';

export default function HomePage() {
  const router = useRouter();
  const { firebaseUser, user, isInitialized } = useAuthStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!isInitialized || showSplash) return;

    const hasOnboarded = localStorage.getItem('hasOnboarded');

    if (!hasOnboarded) {
      router.push('/onboarding');
    } else if (!firebaseUser) {
      router.push('/auth/login');
    } else if (!user) {
      router.push('/auth/register');
    } else {
      router.push('/home');
    }
  }, [firebaseUser, user, isInitialized, showSplash, router]);

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