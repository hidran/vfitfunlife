"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { Sidebar } from "@/components/admin";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { firebaseUser, user, isLoading, isInitialized, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    // Redirect to login if not authenticated
    if (!firebaseUser) {
      router.replace("/auth/login");
      return;
    }

    // Check if user has admin role
    if (user && user.role !== "admin" && user.role !== "superadmin") {
      router.replace("/");
    }
  }, [firebaseUser, user, isInitialized, router]);

  // Show loading state
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-[#00C9FF] rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated or not admin
  if (!firebaseUser || !user || (user.role !== "admin" && user.role !== "superadmin")) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-[#00C9FF] rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Sidebar */}
      <Sidebar
        userRole={user.role}
        userName={user.fullName}
        userAvatar={user.avatarUrl || firebaseUser.photoURL}
        notificationCount={0}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main
        className={cn(
          "transition-all duration-300 min-h-screen",
          "lg:ml-64" // Account for sidebar width on desktop
        )}
      >
        {/* Mobile Header Padding */}
        <div className="h-16 lg:hidden" />
        
        {/* Content Area */}
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
