'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  Star,
  X,
  RotateCcw,
  Share2,
  Download,
  CheckCircle,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleMap } from '@/components/map/GoogleMap';
import type { Booking, BookingStatus } from '@/types/booking';

const statusConfig: Record<BookingStatus, { label: string; variant: any; icon: any }> = {
  pending: { label: 'In attesa', variant: 'warning', icon: AlertCircle },
  confirmed: { label: 'Confermato', variant: 'success', icon: CheckCircle },
  in_progress: { label: 'In corso', variant: 'info', icon: Clock },
  completed: { label: 'Completato', variant: 'default', icon: CheckCircle },
  cancelled: { label: 'Annullato', variant: 'error', icon: X },
  no_show: { label: 'No show', variant: 'error', icon: AlertCircle },
};

// Mock booking data
const MOCK_BOOKING: Booking = {
  id: 'booking-1',
  userId: 'user-1',
  providerId: 'provider-1',
  serviceId: 'svc-1',
  serviceName: 'Personal Training 1-to-1',
  providerName: 'Marco Rossi',
  providerAvatar: '/images/placeholder.jpg',
  scheduledAt: { toDate: () => new Date(Date.now() + 86400000 * 2) } as any,
  scheduledEndAt: { toDate: () => new Date(Date.now() + 86400000 * 2 + 3600000) } as any,
  duration: 60,
  locationType: 'in_person',
  location: {
    address: 'Via Roma 123, Milano',
    lat: 45.4642,
    lng: 9.1900,
  },
  servicePrice: 60,
  platformFee: 3,
  discountAmount: 0,
  pointsUsed: 0,
  pointsValue: 0,
  totalPrice: 63,
  status: 'confirmed',
  paymentStatus: 'paid',
  hasReviewed: false,
  createdAt: { toDate: () => new Date() } as any,
  updatedAt: { toDate: () => new Date() } as any,
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const justConfirmed = searchParams.get('confirmed') === 'true';

  const { getBooking, cancelBooking } = useBookingStore();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    setLoading(true);
    // In real app, fetch from API
    // const booking = await getBooking(bookingId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setBooking(MOCK_BOOKING);
    setLoading(false);
  };

  const handleCancel = async () => {
    try {
      await cancelBooking(bookingId, 'Annullato dall\'utente');
      setShowCancelModal(false);
      loadBooking();
    } catch (error) {
      alert('Errore durante l\'annullamento');
    }
  };

  const handleAddToCalendar = () => {
    if (!booking) return;
    
    const start = booking.scheduledAt.toDate();
    const end = booking.scheduledEndAt?.toDate() || new Date(start.getTime() + (booking.duration || 60) * 60000);
    
    const event = {
      title: booking.serviceName || 'Prenotazione',
      description: `Prenotazione con ${booking.providerName || 'Provider'}`,
      location: booking.location?.address || '',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };

    // Google Calendar URL
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      event.title
    )}&dates=${start.toISOString().replace(/[-:]/g, '').split('.')[0]}/${end
      .toISOString()
      .replace(/[-:]/g, '')
      .split('.')[0]}&details=${encodeURIComponent(
      event.description
    )}&location=${encodeURIComponent(event.location)}`;

    window.open(googleUrl, '_blank');
  };

  const handleShare = async () => {
    if (!booking) return;

    const shareData = {
      title: 'La mia prenotazione VFit',
      text: `Ho prenotato ${booking.serviceName} con ${booking.providerName}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copiato negli appunti!');
    }
  };

  const handleChat = () => {
    router.push(`/chat/${booking?.providerId}`);
  };

  const handleReview = () => {
    router.push(`/bookings/${bookingId}/review`);
  };

  if (loading || !booking) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  const status = statusConfig[booking.status];
  const scheduledAt = booking.scheduledAt.toDate();
  const isPast = scheduledAt < new Date();
  const canCancel = (booking.status === 'confirmed' || booking.status === 'pending') && !isPast;
  const canReschedule = booking.status === 'confirmed' && !isPast;
  const canReview = booking.status === 'completed' && !booking.hasReviewed;

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Success Banner */}
      {justConfirmed && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-success/20 border-b border-success/30 p-4"
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-success" />
            <div>
              <p className="font-semibold text-success">Prenotazione confermata!</p>
              <p className="text-sm text-success/80">
                Riceverai una conferma via email
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-white/10">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <h1 className="text-lg font-semibold text-white">Dettaglio prenotazione</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Share2 className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-32">
        {/* Status Card */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center',
                booking.status === 'confirmed' && 'bg-success/20',
                booking.status === 'pending' && 'bg-warning/20',
                booking.status === 'cancelled' && 'bg-error/20',
                booking.status === 'completed' && 'bg-[var(--section-primary)]/20',
              )}>
                <status.icon className={cn(
                  'w-6 h-6',
                  booking.status === 'confirmed' && 'text-success',
                  booking.status === 'pending' && 'text-warning',
                  booking.status === 'cancelled' && 'text-error',
                  booking.status === 'completed' && 'text-[var(--section-primary)]',
                )} />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Stato</p>
                <p className="font-semibold text-white">{status.label}</p>
              </div>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

        {/* Provider Card */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={booking.providerAvatar}
              alt={booking.providerName}
              size="xl"
            />
            <div className="flex-1">
              <h2 className="font-semibold text-white">{booking.providerName}</h2>
              <p className="text-text-secondary">{booking.serviceName}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleChat}
                className="p-2 rounded-full bg-[var(--section-primary)]/20 text-[var(--section-primary)] hover:bg-[var(--section-primary)]/30 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-white">Data e ora</h3>
          
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[var(--section-primary)]" />
            <div>
              <p className="text-white">
                {scheduledAt.toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-[var(--section-primary)]" />
            <div>
              <p className="text-white">
                {scheduledAt.toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' '}({booking.duration} minuti)
              </p>
            </div>
          </div>

          {!isPast && booking.status !== 'cancelled' && (
            <button
              onClick={handleAddToCalendar}
              className="w-full mt-2 py-2.5 bg-white/10 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Aggiungi al calendario
            </button>
          )}
        </div>

        {/* Location */}
        {booking.location && (
          <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-white">Location</h3>
            
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[var(--section-primary)] mt-0.5" />
              <div>
                <p className="text-white">{booking.location.address}</p>
                <a
                  href={`https://maps.google.com/?q=${booking.location.lat},${booking.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--section-primary)] hover:underline mt-1 inline-block"
                >
                  Ottieni indicazioni
                </a>
              </div>
            </div>

            {booking.location.lat && booking.location.lng && (
              <div className="h-40 rounded-xl overflow-hidden mt-3">
                <GoogleMap
                  gyms={[{
                    id: booking.id,
                    name: booking.providerName || 'Provider',
                    city: 'Milano',
                    rating: 5,
                    reviews: 0,
                    distanceKm: 0,
                    lat: booking.location.lat,
                    lng: booking.location.lng,
                  }]}
                  className="h-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Payment Info */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-white">Pagamento</h3>
          
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Stato</span>
            <Badge variant={booking.paymentStatus === 'paid' ? 'success' : 'warning'}>
              {booking.paymentStatus === 'paid' ? 'Pagato' : 'In attesa'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Totale</span>
            <span className="font-semibold text-white">{formatPrice(booking.totalPrice)}</span>
          </div>

          {booking.promotionCode && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Codice promozionale</span>
              <span className="text-success">{booking.promotionCode}</span>
            </div>
          )}

          <button className="w-full mt-2 py-2.5 bg-white/10 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-2">
            <Download className="w-4 h-4" />
            Scarica ricevuta
          </button>
        </div>

        {/* Booking ID */}
        <div className="flex items-center justify-between text-sm text-text-tertiary">
          <span>ID Prenotazione</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(booking.id);
              alert('ID copiato!');
            }}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {booking.id}
            <Copy className="w-3 h-3" />
          </button>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {canReview && (
            <Button
              onClick={handleReview}
              className="w-full"
            >
              <Star className="w-5 h-5 mr-2" />
              Lascia una recensione
            </Button>
          )}

          {canReschedule && (
            <Button
              variant="secondary"
              onClick={() => router.push(`/bookings/${bookingId}/reschedule`)}
              className="w-full"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Riprogramma
            </Button>
          )}

          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3 border border-error/30 text-error rounded-xl font-medium hover:bg-error/10 transition-colors"
            >
              <X className="w-5 h-5 inline mr-2" />
              Annulla prenotazione
            </button>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#2A2D3A] rounded-2xl p-6 w-full max-w-sm"
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Annulla prenotazione
            </h3>
            <p className="text-text-secondary text-sm mb-4">
              Sei sicuro di voler annullare questa prenotazione? 
              La cancellazione gratuita è disponibile fino a 24 ore prima.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCancelModal(false)}
                className="flex-1"
              >
                Mantieni
              </Button>
              <button
                onClick={handleCancel}
                className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-error/90 transition-colors"
              >
                Annulla
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
