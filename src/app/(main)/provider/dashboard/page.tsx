'use client';

import { useEffect } from 'react';
import {
  Calendar,
  Users,
  Wallet,
  Star,
  CheckCircle,
  TrendingUp,
  Clock,
  ChevronRight,
  Bell,
} from 'lucide-react';
import { StatCard } from '@/components/provider/StatCard';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import Link from 'next/link';

export default function ProviderDashboardPage() {
  const { t, locale } = useI18n();
  const {
    dashboardStats,
    bookings,
    activities,
    isLoading,
    fetchDashboardStats,
    fetchBookings,
    fetchActivities,
  } = useProviderStore();

  useEffect(() => {
    fetchDashboardStats();
    fetchBookings({ status: 'all' });
    fetchActivities(5);
  }, [fetchDashboardStats, fetchBookings, fetchActivities]);

  // Use real data from Firestore
  const stats = dashboardStats || {
    todayAppointments: 0,
    weekBookings: 0,
    monthEarnings: 0,
    newClients: 0,
    completionRate: 0,
    averageRating: 0,
    chartData: [],
  };

  const upcomingBookings = bookings.slice(0, 3);

  const formatTime = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('provider.dashboard.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('provider.dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/provider/availability">
            <Button variant="secondary" size="sm">
              <Clock className="w-4 h-4 mr-2" />
              {t('provider.dashboard.btn.setAvailability')}
            </Button>
          </Link>
          <Link href="/provider/schedule">
            <Button size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              {t('provider.dashboard.btn.viewCalendar')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title={t('provider.dashboard.stats.todayAppointments')}
          value={stats.todayAppointments}
          icon={Calendar}
          trend={12}
          trendLabel={t('provider.dashboard.trend.vsYesterday')}
        />
        <StatCard
          title={t('provider.dashboard.stats.weekBookings')}
          value={stats.weekBookings}
          icon={TrendingUp}
          trend={8}
          trendLabel={t('provider.dashboard.trend.vsLastWeek')}
        />
        <StatCard
          title={t('provider.dashboard.stats.monthEarnings')}
          value={`€${stats.monthEarnings.toLocaleString()}`}
          icon={Wallet}
          trend={15}
          trendLabel={t('provider.dashboard.trend.vsLastMonth')}
        />
        <StatCard
          title={t('provider.dashboard.stats.newClients')}
          value={stats.newClients}
          icon={Users}
          trend={20}
          trendLabel={t('provider.dashboard.trend.vsLastMonth')}
        />
        <StatCard
          title={t('provider.dashboard.stats.completionRate')}
          value={`${stats.completionRate}%`}
          icon={CheckCircle}
          trend={2}
          trendLabel={t('provider.dashboard.trend.vsLastMonth')}
        />
        <StatCard
          title={t('provider.dashboard.stats.averageRating')}
          value={stats.averageRating}
          icon={Star}
          trend={5}
          trendLabel={t('provider.dashboard.trend.vsLastMonth')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Appointments */}
        <div className="lg:col-span-2">
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">{t('provider.dashboard.upcoming.title')}</h2>
              <Link
                href="/provider/bookings"
                className="text-sm text-section-primary hover:underline flex items-center gap-1"
              >
                {t('provider.dashboard.upcoming.viewAll')}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="divide-y divide-white/5">
              {upcomingBookings.length === 0 ? (
                <div className="p-8 text-center">
                  <Calendar className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">{t('provider.dashboard.upcoming.empty.title')}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('provider.dashboard.upcoming.empty.subtitle')}
                  </p>
                </div>
              ) : (
                upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 hover:bg-[#1A1D29]/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center justify-center w-14 h-14 bg-[#1A1D29] rounded-lg">
                        <span className="text-xs text-gray-400">
                          {formatDate(booking.scheduledAt)}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {formatTime(booking.scheduledAt)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-white">{booking.userName}</p>
                        <p className="text-sm text-gray-400">{booking.serviceName}</p>
                        {booking.bookingType === 'virtual' && (
                          <span className="text-xs text-blue-400">{t('provider.dashboard.upcoming.virtual')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`
                        px-2 py-1 rounded text-xs font-medium
                        ${booking.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : ''}
                        ${booking.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                      `}>
                        {booking.status}
                      </span>
                      <Link href={`/provider/bookings/${booking.id}`}>
                        <Button variant="secondary" size="sm">
                          {t('provider.dashboard.upcoming.details')}
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">{t('provider.dashboard.activity.title')}</h2>
              <Bell className="w-5 h-5 text-gray-400" />
            </div>

            <div className="p-4 space-y-4">
              {activities.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">{t('provider.dashboard.activity.empty.title')}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('provider.dashboard.activity.empty.subtitle')}
                  </p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-section-primary/20 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-4 h-4 text-section-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-white">{activity.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {activity.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-6 bg-section-gradient rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">{t('provider.dashboard.grow.title')}</h3>
            <p className="text-sm text-white/80 mb-4">
              {t('provider.dashboard.grow.subtitle')}
            </p>
            <Link href="/profile/edit">
              <Button variant="secondary" fullWidth>
                {t('provider.dashboard.grow.cta')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
