"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/firebase";
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/admin",
      icon: <LayoutDashboard className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Users",
      href: "/admin/users",
      icon: <Users className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Providers",
      href: "/admin/providers",
      icon: <Store className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Bookings",
      href: "/admin/bookings",
      icon: <Calendar className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "User Types",
      href: "/admin/user-types",
      icon: <Tag className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Venues",
      href: "/admin/venues",
      icon: <MapPin className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Payments",
      href: "/admin/payments",
      icon: <CreditCard className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Data Management",
      href: "/admin/data",
      icon: <Database className="w-5 h-5" />,
      allowedRoles: ["superadmin", "admin"],
    },
    {
      label: "Settings",
      href: "/admin/settings",
      icon: <Settings className="w-5 h-5" />,
      allowedRoles: ["superadmin"],
    },
    {
      label: "System Logs",
      href: "/admin/logs",
      icon: <FileText className="w-5 h-5" />,
      allowedRoles: ["superadmin"],
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
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 rounded-xl bg-background-dark border border-white/10 flex items-center justify-center text-white"
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen bg-[#1E2230] border-r border-white/10 z-40 transition-all duration-300 flex flex-col",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          {!isCollapsed && (
            <Link href="/admin" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Admin</span>
            </Link>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex w-6 h-6 rounded-full bg-white/10 items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
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
          <ul className="space-y-1 px-2">
            {filteredNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                    isActive(item.href)
                      ? "bg-gradient-to-r from-[#00C9FF]/20 to-[#7B61FF]/20 text-white border border-white/10"
                      : "text-white/60 hover:text-white hover:bg-white/5"
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
        <div className="border-t border-white/10 p-4">
          {/* Notifications */}
          {!isCollapsed && (
            <button className="w-full flex items-center gap-3 px-3 py-2 mb-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all">
              <Bell className="w-5 h-5" />
              <span className="text-sm">Notifications</span>
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
                  className="w-10 h-10 rounded-xl object-cover border border-white/10"
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
                title={userRole === "superadmin" ? "Superadmin" : "Admin"}
              />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {userName}
                </p>
                <p className="text-xs text-white/50 capitalize">{userRole}</p>
              </div>
            )}
            <button
              onClick={onLogout}
              className={cn(
                "p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors",
                isCollapsed && "mt-2"
              )}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
