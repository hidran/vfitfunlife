'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/button';
import { BookingCard } from '@/components/booking';
import { useI18n } from '@/hooks/useI18n';
import { isActive, isCancelled, isDelivered } from '@/lib/bookingStatus';
import type { Booking } from '@/types/booking';

type BookingTab = 'upcoming' | 'past' | 'cancelled';

export default function BookingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const {
    userBookings,
    isLoadingBookings,
    fetchUserBookings,
    cancelBooking,
    rescheduleBooking,
  } = useBookingStore();

  const [activeTab, setActiveTab] = useState<BookingTab>('upcoming');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBookings = useCallback(async () => {
    if (!user) return;

    // 'upcoming' and 'cancelled' each span several statuses now, so the fetch is
    // unfiltered for those and narrowed client-side in filteredBookings below.
    const status = activeTab === 'past' ? 'completed' : undefined;

    await fetchUserBookings(user.uid, { status });
  }, [user, activeTab, fetchUserBookings]);

  // Load bookings on mount and when filters change
  useEffect(() => {
    if (user) {
      void loadBookings();
    }
  }, [user, loadBookings]);

  // Pull to refresh handler
  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    await loadBookings();
    setIsRefreshing(false);
  };

  // Filter bookings by tab
  const filteredBookings = userBookings.filter((booking) => {
    switch (activeTab) {
      case 'upcoming':
        return isActive(booking.status);
      case 'past':
        return isDelivered(booking.status) || booking.status === 'no_show';
      case 'cancelled':
        return isCancelled(booking.status) || booking.status === 'declined';
      default:
        return true;
    }
  });

  // Sort by date
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    return b.scheduledAt.toDate().getTime() - a.scheduledAt.toDate().getTime();
  });

  const handleCancel = async (id: string) => {
    if (!confirm(t('bookings.list.confirmCancel'))) return;

    try {
      await cancelBooking(id, "Annullato dall'utente");
    } catch (error) {
      alert(t('bookings.list.errorCancel'));
    }
  };

  const handleReschedule = (id: string) => {
    router.push(`/bookings/${id}/reschedule`);
  };

  const handleReview = (id: string) => {
    router.push(`/bookings/${id}/review`);
  };

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Pull to refresh indicator */}
      <AnimatePresence>
        {isRefreshing && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4"
          >
            <div className="bg-surface-elevated rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
              <Spinner size="sm" />
              <span className="text-sm text-content">{t('bookings.list.refreshing')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-display font-bold text-text-inverse">
            {t('bookings.list.title')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={loadBookings}
              disabled={isLoadingBookings}
              className="p-2 rounded-full hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn(
                'w-5 h-5 text-text-secondary',
                isLoadingBookings && 'animate-spin'
              )} />
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push('/booking')}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('bookings.list.newBooking')}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-elevated/50 rounded-xl p-1">
          {[
            { id: 'upcoming', label: t('bookings.list.tab.upcoming') },
            { id: 'past', label: t('bookings.list.tab.past') },
            { id: 'cancelled', label: t('bookings.list.tab.cancelled') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BookingTab)}
              className={cn(
                'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-[var(--section-primary)] text-white shadow-lg'
                  : 'text-text-secondary hover:text-content'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-24">
        {isLoadingBookings && !isRefreshing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Spinner size="lg" />
            <p className="text-text-secondary mt-4">{t('bookings.list.loading')}</p>
          </div>
        ) : sortedBookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-content mb-2">
              {activeTab === 'upcoming' && t('bookings.list.empty.upcoming')}
              {activeTab === 'past' && t('bookings.list.empty.past')}
              {activeTab === 'cancelled' && t('bookings.list.empty.cancelled')}
            </h3>
            <p className="text-text-secondary mb-6">
              {activeTab === 'upcoming' && t('bookings.list.empty.upcomingHint')}
              {activeTab === 'past' && t('bookings.list.empty.pastHint')}
              {activeTab === 'cancelled' && t('bookings.list.empty.cancelledHint')}
            </p>
            {activeTab === 'upcoming' && (
              <Button onClick={() => router.push('/booking')}>
                {t('bookings.list.searchServices')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedBookings.map((booking, index) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <BookingCard
                  booking={booking}
                  compact={activeTab === 'upcoming'}
                  onCancel={handleCancel}
                  onReschedule={handleReschedule}
                  onReview={handleReview}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
