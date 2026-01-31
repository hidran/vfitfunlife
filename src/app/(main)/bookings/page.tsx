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
import type { Booking } from '@/types/booking';

type BookingTab = 'upcoming' | 'past' | 'cancelled';

export default function BookingsPage() {
  const router = useRouter();
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

  // Load bookings on mount
  useEffect(() => {
    if (user) {
      loadBookings();
    }
  }, [user, activeTab]);

  const loadBookings = useCallback(async () => {
    if (!user) return;
    
    const status = activeTab === 'upcoming' 
      ? 'confirmed' 
      : activeTab === 'past' 
        ? 'completed' 
        : 'cancelled';
    
    await fetchUserBookings(user.uid, { status });
  }, [user, activeTab, fetchUserBookings]);

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
        return ['confirmed', 'pending', 'in_progress'].includes(booking.status);
      case 'past':
        return booking.status === 'completed';
      case 'cancelled':
        return booking.status === 'cancelled';
      default:
        return true;
    }
  });

  // Sort by date
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    return b.scheduledAt.toDate().getTime() - a.scheduledAt.toDate().getTime();
  });

  const handleCancel = async (id: string) => {
    if (!confirm('Sei sicuro di voler annullare questa prenotazione?')) return;
    
    try {
      await cancelBooking(id, 'Annullato dall\'utente');
    } catch (error) {
      alert('Errore durante l\'annullamento');
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
            <div className="bg-[#2A2D3A] rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
              <Spinner size="sm" />
              <span className="text-sm text-white">Aggiornamento...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-display font-bold text-text-inverse">
            Le mie prenotazioni
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={loadBookings}
              disabled={isLoadingBookings}
              className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
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
              Nuova
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#2A2D3A]/50 rounded-xl p-1">
          {[
            { id: 'upcoming', label: 'In arrivo' },
            { id: 'past', label: 'Passate' },
            { id: 'cancelled', label: 'Annullate' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BookingTab)}
              className={cn(
                'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-[var(--section-primary)] text-white shadow-lg'
                  : 'text-text-secondary hover:text-white'
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
            <p className="text-text-secondary mt-4">Caricamento prenotazioni...</p>
          </div>
        ) : sortedBookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {activeTab === 'upcoming' && 'Nessuna prenotazione in arrivo'}
              {activeTab === 'past' && 'Nessuna prenotazione passata'}
              {activeTab === 'cancelled' && 'Nessuna prenotazione annullata'}
            </h3>
            <p className="text-text-secondary mb-6">
              {activeTab === 'upcoming' && 'Prenota il tuo primo servizio con i nostri professionisti'}
              {activeTab === 'past' && 'Le tue prenotazioni completate appariranno qui'}
              {activeTab === 'cancelled' && 'Le prenotazioni annullate appariranno qui'}
            </p>
            {activeTab === 'upcoming' && (
              <Button onClick={() => router.push('/booking')}>
                Cerca servizi
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
