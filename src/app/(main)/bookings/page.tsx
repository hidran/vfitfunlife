'use client';

import { useState } from 'react';
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type BookingTab = 'upcoming' | 'past';

interface MockBooking {
  id: string;
  serviceName: string;
  venueName: string;
  date: string;
  time: string;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  image: string;
}

const mockBookings: MockBooking[] = [
  {
    id: '1',
    serviceName: 'Personal Training',
    venueName: 'V Fitness Milano Centro',
    date: '2026-02-01',
    time: '10:00',
    status: 'confirmed',
    image: '/images/placeholder.jpg',
  },
  {
    id: '2',
    serviceName: 'Massaggio Rilassante',
    venueName: 'V Wellness Spa',
    date: '2026-02-03',
    time: '15:30',
    status: 'pending',
    image: '/images/placeholder.jpg',
  },
];

const pastBookings: MockBooking[] = [
  {
    id: '3',
    serviceName: 'Yoga Class',
    venueName: 'V Fitness Milano Centro',
    date: '2026-01-25',
    time: '09:00',
    status: 'completed',
    image: '/images/placeholder.jpg',
  },
];

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<BookingTab>('upcoming');

  const bookings = activeTab === 'upcoming' ? mockBookings : pastBookings;

  const getStatusBadge = (status: MockBooking['status']) => {
    const styles = {
      confirmed: 'bg-success/20 text-success',
      pending: 'bg-warning/20 text-warning',
      completed: 'bg-info/20 text-info',
      cancelled: 'bg-error/20 text-error',
    };
    const labels = {
      confirmed: 'Confermato',
      pending: 'In attesa',
      completed: 'Completato',
      cancelled: 'Annullato',
    };
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', styles[status])}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background-dark pb-20">
      {/* Header */}
      <div className="p-4">
        <h1 className="text-2xl font-display font-bold text-text-inverse">Le mie prenotazioni</h1>
      </div>

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex bg-background-secondary/10 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'upcoming'
                ? 'bg-[var(--section-primary)] text-white'
                : 'text-text-secondary'
            )}
          >
            In arrivo
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'past'
                ? 'bg-[var(--section-primary)] text-white'
                : 'text-text-secondary'
            )}
          >
            Passate
          </button>
        </div>
      </div>

      {/* Bookings List */}
      <div className="px-4 space-y-3">
        {bookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary">
              {activeTab === 'upcoming'
                ? 'Nessuna prenotazione in arrivo'
                : 'Nessuna prenotazione passata'}
            </p>
          </div>
        ) : (
          bookings.map((booking) => (
            <button
              key={booking.id}
              className="w-full bg-background-secondary/5 rounded-xl p-4 flex gap-4 items-center text-left hover:bg-background-secondary/10 transition-colors"
            >
              <div className="w-16 h-16 rounded-lg bg-background-secondary/20 flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-text-inverse truncate">
                    {booking.serviceName}
                  </h3>
                  {getStatusBadge(booking.status)}
                </div>

                <p className="text-sm text-text-secondary truncate mb-2">
                  {booking.venueName}
                </p>

                <div className="flex items-center gap-4 text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(booking.date).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {booking.time}
                  </span>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-text-tertiary flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
