'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SplashScreen } from '@/components/screens/SplashScreen';
import { useAuthStore } from '@/stores/authStore';

export default function HomePage() {
  const router = useRouter();
  // Use individual selectors to ensure re-renders on state changes
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  
  const [showSplash, setShowSplash] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectAttempted = useRef(false);

  // Debug logging
  useEffect(() => {
    console.log('[HomePage] State:', {
      isInitialized,
      isLoading,
      showSplash,
      isRedirecting,
      hasFirebaseUser: !!firebaseUser,
      hasUser: !!user,
      firebaseUid: firebaseUser?.uid,
      userId: user?.id,
    });
  }, [isInitialized, isLoading, showSplash, isRedirecting, firebaseUser, user]);

  useEffect(() => {
    // Prevent multiple redirects
    if (redirectAttempted.current) return;
    
    // Only proceed when auth is initialized AND splash is done
    if (!isInitialized || showSplash) return;

    const handleRedirect = async () => {
      redirectAttempted.current = true;
      setIsRedirecting(true);
      
      const hasOnboarded = localStorage.getItem('hasOnboarded');
      console.log('[HomePage] Redirecting:', {
        hasOnboarded,
        hasFirebaseUser: !!firebaseUser,
        hasUser: !!user,
      });

      try {
        if (!hasOnboarded) {
          await router.replace('/onboarding');
        } else if (!firebaseUser) {
          await router.replace('/auth/login');
        } else if (!user) {
          // User has Firebase auth but no Firestore profile - needs to complete registration
          await router.replace('/auth/register');
        } else {
          // Fully authenticated user
          await router.replace('/home');
        }
      } catch (error) {
        console.error('[HomePage] Redirect failed:', error);
        redirectAttempted.current = false;
        setIsRedirecting(false);
      }
    };

    handleRedirect();
  }, [isInitialized, showSplash, firebaseUser, user, router]);

  const handleSplashComplete = () => {
    console.log('[HomePage] Splash complete');
    setShowSplash(false);
  };

  // Show splash screen first
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Show loading state while auth is initializing
  if (!isInitialized || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-pulse">
          <span className="text-2xl font-display font-bold bg-gradient-to-r from-vfit-primary via-vfun-primary to-vlife-primary bg-clip-text text-transparent">
            Initializing...
          </span>
        </div>
        <p className="text-sm text-text-tertiary">Checking authentication...</p>
      </div>
    );
  }

  // Show error state if redirect failed
  if (!isRedirecting && !redirectAttempted.current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <p className="text-lg text-text-inverse">Something went wrong</p>
        <p className="text-sm text-text-tertiary text-center">
          {!firebaseUser 
            ? 'Not authenticated. Redirecting to login...'
            : !user 
              ? 'Profile incomplete. Redirecting to registration...'
              : 'Ready to redirect...'}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-section-primary text-white rounded-lg"
        >
          Reload Page
        </button>
      </div>
    );
  }

  // Default loading state while redirecting
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