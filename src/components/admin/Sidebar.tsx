"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/firebase";
import { useI18n } from "@/hooks/useI18n";
import {
  LayoutDashboard,
  Users,
  Store,
  Calendar,
  Tag,
  MapPin,
  CreditCard,
  Settings,
  FileText,
  Shield,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Bell,
  Database,
  Dumbbell,
  UserCircle,
} from "lucide-react";

interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userAvatar?: string | null;
  notificationCount?: number;
  onLogout: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  badge?: number;
}

export function Sidebar({
  userRole,
  userName,
  userAvatar,
  notificationCount = 0,
  onLogout,
}: SidebarProps) {
  const { t } = useI18n();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      label: t('admin.sidebar.nav.dashboard'),
      href: "/admin",
      icon: <LayoutDashboard className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.users'),
      href: "/admin/users",
      icon: <Users className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.providers'),
      href: "/admin/providers",
      icon: <Store className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.bookings'),
      href: "/admin/bookings",
      icon: <Calendar className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.userTypes'),
      href: "/admin/user-types",
      icon: <Tag className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.services'),
      href: "/admin/services",
      icon: <Dumbbell className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.venues'),
      href: "/admin/venues",
      icon: <MapPin className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.payments'),
      href: "/admin/payments",
      icon: <CreditCard className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.dataManagement'),
      href: "/admin/data",
      icon: <Database className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: t('admin.sidebar.nav.settings'),
      href: "/admin/settings",
      icon: <Settings className="w-5 h-5" />,
      allowedRoles: ["superadmin"],
    },
    {
      label: t('admin.sidebar.nav.systemLogs'),
      href: "/admin/logs",
      icon: <FileText className="w-5 h-5" />,
      allowedRoles: ["superadmin"],
    },
    {
      label: t('admin.sidebar.nav.myProfile'),
      href: "/profile",
      icon: <UserCircle className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
  ];

  const filteredNavItems = navItems.filter((item) =>
    item.allowedRoles.includes(userRole)
  );

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 rounded-xl bg-background-dark border border-hairline flex items-center justify-center text-content"
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen bg-surface border-r border-hairline z-40 transition-all duration-300 flex flex-col",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-hairline">
          {!isCollapsed && (
            <Link href="/admin" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-content">{t('admin.sidebar.title')}</span>
            </Link>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex w-6 h-6 rounded-full bg-surface-2 items-center justify-center text-content-muted hover:text-content hover:bg-white/20 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronLeft className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* Logout (top) */}
          <div className="px-2 pb-3 mb-2 border-b border-hairline">
            <button
              onClick={() => {
                setIsMobileOpen(false);
                onLogout();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-[#EF4444] hover:bg-[#EF4444]/10",
                isCollapsed && "justify-center"
              )}
              title={t('admin.sidebar.logout')}
            >
              <LogOut className="w-5 h-5" />
              {!isCollapsed && (
                <span className="font-medium text-sm">{t('admin.sidebar.logout')}</span>
              )}
            </button>
          </div>
          <ul className="space-y-1 px-2">
            {filteredNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                    isActive(item.href)
                      ? "bg-gradient-to-r from-[#00C9FF]/20 to-[#7B61FF]/20 text-content border border-hairline"
                      : "text-content-muted hover:text-content hover:bg-surface-2"
                  )}
                >
                  <span
                    className={cn(
                      "transition-colors",
                      isActive(item.href) && "text-[#00C9FF]"
                    )}
                  >
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="font-medium text-sm">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto bg-[#EF4444] text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {isCollapsed && item.badge && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-[#EF4444] text-white text-[10px] font-semibold flex items-center justify-center rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Section */}
        <div className="border-t border-hairline p-4">
          {/* Notifications */}
          {!isCollapsed && (
            <button className="w-full flex items-center gap-3 px-3 py-2 mb-3 rounded-xl text-content-muted hover:text-content hover:bg-surface-2 transition-all">
              <Bell className="w-5 h-5" />
              <span className="text-sm">{t('admin.sidebar.notifications')}</span>
              {notificationCount > 0 && (
                <span className="ml-auto bg-[#EF4444] text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {notificationCount}
                </span>
              )}
            </button>
          )}

          {/* User Info */}
          <div
            className={cn(
              "flex items-center gap-3",
              isCollapsed && "flex-col"
            )}
          >
            <div className="relative">
              {userAvatar ? (
                <Image
                  src={userAvatar}
                  alt={userName}
                  width={40}
                  height={40}
                  unoptimized
                  className="w-10 h-10 rounded-xl object-cover border border-hairline"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1E2230]",
                  userRole === "superadmin" ? "bg-[#FFD700]" : "bg-[#10B981]"
                )}
                title={userRole === "superadmin" ? t('admin.sidebar.roleTitle.superadmin') : t('admin.sidebar.roleTitle.admin')}
              />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content truncate">
                  {userName}
                </p>
                <p className="text-xs text-content-muted capitalize">{userRole}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
