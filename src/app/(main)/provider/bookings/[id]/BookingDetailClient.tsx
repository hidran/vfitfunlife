'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Euro,
  Calendar,
  Clock,
  MapPin,
  User,
  CreditCard,
  FileText,
  MessageSquare,
  CheckCircle,
  XCircle,
  RefreshCw,
  Star,
  Edit,
  Phone,
  Mail,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { useProviderStore } from '@/stores/providerStore';
import { useAuthStore } from '@/stores/authStore';
import { RecordPaymentSheet } from '@/components/provider/RecordPaymentSheet';
import { CancelBookingDialog } from '@/components/provider/CancelBookingDialog';
import { bookingTypeLabel, paymentStatusLabel } from '@/lib/bookingLabels';
import { BOOKING_STATUS_META } from '@/lib/bookingStatus';
import { Spinner } from '@/components/ui/Spinner';
import type { MessageKey } from '@/i18n/messages';
import { cn, formatPrice } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { queryKeys } from '@/lib/queryKeys';
import { updateBookingPrivateNotes } from '@/lib/firebase/functions';
import { findClientIdForUser } from '@/lib/firebase/provider';
import { chatHref } from '@/lib/routes';

export default function BookingDetailClient() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // See /provider/bookings/detail — the path param is always 'placeholder' in the export.
  // Static export can hydrate useSearchParams empty on first paint, and this route has
  // no [id] segment to fall back to, so read the URL directly as the last resort.
  // See /provider/bookings/detail — useSearchParams can hydrate empty under
  // output:'export', so fall back to the raw URL, then to the [id] segment.
  const id = searchParams.get('id') ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id')
      : null) ??
    (params?.id as string | undefined);
  const {
    bookings, isLoadingBookings, bookingError, fetchBookings, confirmBooking, declineBooking, completeBooking,
    markBookingNoShow, cancelBooking, confirmBookingPayment,
  } = useProviderStore(
    useShallow((s) => ({
      bookings: s.bookings,
      isLoadingBookings: s.isLoadingBookings,
      bookingError: s.bookingError,
      fetchBookings: s.fetchBookings,
      confirmBooking: s.confirmBooking,
      declineBooking: s.declineBooking,
      completeBooking: s.completeBooking,
      markBookingNoShow: s.markBookingNoShow,
      cancelBooking: s.cancelBooking,
      confirmBookingPayment: s.confirmBookingPayment,
    })),
  );
  const user = useAuthStore((s) => s.user);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const booking = bookings.find((entry) => entry.id === id);
  // Mirrors the server guard in canTransition: completed/no_show are only valid once the
  // session has actually ended. Offering the button earlier would just produce an error.
  const sessionEndsAt = booking?.scheduledEndAt
    ? (booking.scheduledEndAt as unknown as { toDate?: () => Date })?.toDate?.() ??
      new Date(booking.scheduledEndAt as unknown as string)
    : null;
  const sessionHasEnded = sessionEndsAt ? sessionEndsAt <= new Date() : false;
  // Deep links from push notifications land here directly, with the store unpopulated — the
  // list page is what normally fills it.
  //
  // This must wait for auth: on a cold load Firebase restores the session asynchronously, so
  // getCurrentProviderId() throws "Not authenticated" if we fetch too early. Gating the query
  // on `user` retries once the session is available. TanStack Query (rather than a manual
  // "if empty" effect) decides *when* to call the store's fetch action, so a remount within
  // the cache's staleTime is instant instead of re-fetching.
  useQuery({
    queryKey: queryKeys.providerBookings(),
    // The store action fills `bookings` and returns nothing; resolve to null because TanStack
    // Query rejects undefined data.
    queryFn: async () => {
      await fetchBookings();
      return null;
    },
    enabled: !!user,
  });

  // The profile link needs the roster document id, not the customer's uid. The booking's own
  // trainer is the roster owner (an admin opening the page is not); the uid is the fallback
  // for a booking without an instructorId.
  const rosterOwnerId = booking?.instructorId ?? user?.uid;
  const { data: clientDocId } = useQuery({
    queryKey: queryKeys.providerClientForUser(rosterOwnerId, booking?.userId),
    queryFn: () => findClientIdForUser(rosterOwnerId!, booking!.userId),
    enabled: !!rosterOwnerId && !!booking?.userId,
    staleTime: 5 * 60_000,
  });

  const [showNotes, setShowNotes] = useState(false);
  const [privateNotes, setPrivateNotes] = useState('');
  // Saved in this session (undefined = use the booking's stored value).
  const [savedNotes, setSavedNotes] = useState<string | null | undefined>(undefined);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState(false);


  const currentNotes =
    savedNotes !== undefined ? savedNotes : ((booking as { internalNotes?: string | null } | undefined)?.internalNotes ?? null);

  const handleSaveNotes = async () => {
    if (!booking) return;
    setIsSavingNotes(true);
    setNotesError(false);
    try {
      const res = await updateBookingPrivateNotes(booking.id, privateNotes);
      setSavedNotes(res.internalNotes);
      setShowNotes(false);
    } catch {
      setNotesError(true);
    } finally {
      setIsSavingNotes(false);
    }
  };

  if (!booking && isLoadingBookings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="md" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          {/* The store swallows fetch failures into state; without this a missing index or
              a denied read renders as a bare "not found", which is impossible to diagnose. */}
          {bookingError && (
            <p className="text-sm text-error mb-3 max-w-md">{bookingError}</p>
          )}
          <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-content-faint light:text-content-muted" />
          </div>
          <h2 className="text-xl font-semibold text-content mb-2">{t('provider.bookingDetail.notFound')}</h2>
          <Link href="/provider/bookings">
            <Button variant="secondary" className="mt-4">
              {t('provider.bookingDetail.backToBookings')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    await confirmBooking(booking.id);
  };

  const handleDecline = async () => {
    await declineBooking(booking.id);
  };

  const handleNoShow = async () => {
    await markBookingNoShow(booking.id);
  };

  const handleComplete = async () => {
    await completeBooking(booking.id);
  };

  const handleCancel = async (reason?: string) => {
    await cancelBooking(booking.id, reason);
  };

  const formatDate = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleString(toLocaleTag(locale));
  };

  const statusMeta = BOOKING_STATUS_META[booking.status];
  // The trainer's "payment received" already moves the booking to payment_confirmed; until the
  // client confirms (or the 48h auto-confirm), say so instead of claiming it is confirmed.
  const awaitingClient =
    booking.status === 'payment_confirmed' &&
    !!booking.paymentConfirmation &&
    !booking.paymentConfirmation.clientResponse &&
    !booking.paymentConfirmation.autoConfirmed;
  const statusBadgeVariant = awaitingClient ? 'warning' : statusMeta.tone;
  const statusBadgeLabel = awaitingClient
    ? t('provider.bookingDetail.status.awaitingClient')
    : t(statusMeta.labelKey);

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/provider/bookings"
        className="inline-flex items-center gap-2 text-content-muted hover:text-content transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('provider.bookingDetail.backToBookings')}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
            <h1 className="text-2xl font-bold text-content">{t('provider.bookingDetail.title')}</h1>
            <Badge variant={statusBadgeVariant} size="md">
              {statusBadgeLabel}
            </Badge>
          </div>
          <p className="text-content-muted">
            {t('provider.bookingDetail.bookingId', { id: booking.id })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {booking.status === 'requested' && (
            <>
              <Button onClick={handleConfirm}>
                <CheckCircle className="w-4 h-4 mr-2" />
                {t('provider.bookingDetail.confirm')}
              </Button>
              <Button variant="outline" onClick={handleDecline} className="border-red-500/50 text-red-400 light:text-red-700 hover:bg-red-500/10">
                <XCircle className="w-4 h-4 mr-2" />
                {t('provider.bookingDetail.decline')}
              </Button>
            </>
          )}
          {booking.status === 'accepted' && sessionHasEnded && (
            <Button variant="outline" onClick={handleNoShow} className="border-amber-500/50 text-amber-400 light:text-amber-700 hover:bg-amber-500/10">
              <XCircle className="w-4 h-4 mr-2" />
              {t('provider.bookingDetail.noShow' as MessageKey)}
            </Button>
          )}
          {booking.status === 'completed' && (
            <Button onClick={() => setShowPaymentSheet(true)}>
              <Euro className="w-4 h-4 mr-2" />
              {t('provider.bookingDetail.recordPayment' as MessageKey)}
            </Button>
          )}
          {booking.status === 'accepted' && (
            <>
              {sessionHasEnded && (
                <Button onClick={handleComplete}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('provider.bookingDetail.markComplete')}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => router.push(`/bookings/reschedule/?id=${booking.id}`)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('provider.bookingDetail.reschedule')}
              </Button>
            </>
          )}
          {(booking.status === 'accepted' || booking.status === 'requested') && (
            <Button variant="outline" onClick={() => setShowCancelDialog(true)} className="border-red-500/50 text-red-400 light:text-red-700 hover:bg-red-500/10">
              <XCircle className="w-4 h-4 mr-2" />
              {t('provider.bookingDetail.cancel')}
            </Button>
          )}
        </div>
      </div>

      <CancelBookingDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
      />

      {showPaymentSheet && (
        <RecordPaymentSheet
          defaultAmount={booking.finalPrice ?? 0}
          onSubmit={(method, amount) => confirmBookingPayment(booking.id, method, amount)}
          onClose={() => setShowPaymentSheet(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Card */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.clientInfo')}</h3>
            <div className="flex items-start gap-4">
              {booking.clientPhotoUrl ? (
                <Image
                  src={booking.clientPhotoUrl}
                  alt={booking.userName}
                  width={64}
                  height={64}
                  unoptimized
                  className="w-16 h-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 shrink-0 rounded-full bg-section-gradient flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-xl font-medium text-content break-words">{booking.userName}</h4>
                <div className="flex flex-col gap-1 mt-2">
                  {booking.userEmail && (
                    <a href={`mailto:${booking.userEmail}`} className="flex min-w-0 items-center gap-2 text-content-muted hover:text-content text-sm">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="truncate">{booking.userEmail}</span>
                    </a>
                  )}
                  <a href={`tel:${booking.userPhone}`} className="flex items-center gap-2 text-content-muted hover:text-content text-sm">
                    <Phone className="w-4 h-4" />
                    {booking.userPhone}
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {clientDocId && (
                    <Link href={`/provider/clients/detail?id=${encodeURIComponent(clientDocId)}`}>
                      <Button variant="secondary" size="sm">
                        <User className="w-4 h-4 mr-2" />
                        {t('provider.bookingDetail.viewProfile')}
                      </Button>
                    </Link>
                  )}
                  {/* Opens (or starts) the chat with the customer, tied to this booking. */}
                  {booking.userId && booking.userId !== user?.uid && (
                    <Link
                      href={chatHref(booking.userId, {
                        name: booking.userName,
                        photoUrl: booking.clientPhotoUrl ?? null,
                        bookingId: booking.id,
                      })}
                    >
                      <Button variant="secondary" size="sm">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {t('provider.bookingDetail.message')}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Service Details */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.serviceDetails')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-content-muted">{t('provider.bookingDetail.service')}</span>
                <span className="text-content font-medium">{booking.serviceName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-muted">{t('provider.bookingDetail.duration')}</span>
                <span className="text-content">{t('provider.bookingDetail.durationMinutes', { count: booking.durationMinutes })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-muted">{t('provider.bookingDetail.type')}</span>
                <span className={cn(
                  'text-sm',
                  booking.bookingType === 'virtual' && 'text-blue-400 light:text-blue-700',
                  booking.bookingType === 'home_service' && 'text-green-400 light:text-green-700',
                  booking.bookingType === 'in_venue' && 'text-purple-400 light:text-purple-700',
                )}>
                  {bookingTypeLabel(t, booking.bookingType)}
                </span>
              </div>
              {booking.venueName && (
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">{t('provider.bookingDetail.location')}</span>
                  <span className="text-content">{booking.venueName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.schedule')}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-section-primary light:text-primary-dark" />
                </div>
                <div>
                  <p className="text-content font-medium">{formatDate(booking.scheduledAt)}</p>
                  <p className="text-sm text-content-muted">{t('provider.bookingDetail.date')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center">
                  <Clock className="w-6 h-6 text-section-primary light:text-primary-dark" />
                </div>
                <div>
                  <p className="text-content font-medium">
                    {formatTime(booking.scheduledAt)} - {formatTime(booking.scheduledEndAt)}
                  </p>
                  <p className="text-sm text-content-muted">{t('provider.bookingDetail.time')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Client Notes */}
          {booking.userNotes && (
            <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
              <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.clientNotes')}</h3>
              <div className="bg-surface-input rounded-lg p-4">
                <p className="text-content/85 whitespace-pre-wrap break-words">{booking.userNotes}</p>
              </div>
            </div>
          )}

          {/* Private Notes */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-content">{t('provider.bookingDetail.privateNotes')}</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!showNotes) setPrivateNotes(currentNotes ?? '');
                  setNotesError(false);
                  setShowNotes(!showNotes);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                {showNotes ? t('provider.bookingDetail.cancelNote') : t('provider.bookingDetail.addNote')}
              </Button>
            </div>
            {showNotes ? (
              <div className="space-y-3">
                <textarea
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder={t('provider.bookingDetail.privateNotesPlaceholder')}
                  maxLength={2000}
                  aria-label={t('provider.bookingDetail.privateNotes')}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-3 text-content placeholder-gray-500 outline-none focus:border-section-primary min-h-[100px]"
                />
                {notesError && (
                  <p role="alert" className="text-sm text-red-400 light:text-red-700">
                    {t('provider.bookingDetail.noteSaveError')}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                    {t('provider.bookingDetail.saveNote')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowNotes(false)}>
                    {t('provider.bookingDetail.cancelNote')}
                  </Button>
                </div>
              </div>
            ) : currentNotes ? (
              <p className="text-content/85 whitespace-pre-wrap break-words">{currentNotes}</p>
            ) : (
              <p className="text-content-faint light:text-content-muted text-sm">{t('provider.bookingDetail.privateNotesEmpty')}</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.paymentSummary')}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-content-muted">{t('provider.bookingDetail.originalPrice')}</span>
                <span className="text-content">{formatPrice(booking.originalPrice, locale)}</span>
              </div>
              {booking.discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">{t('provider.bookingDetail.discount')}</span>
                  <span className="text-green-400 light:text-green-700">-{formatPrice(booking.discountAmount, locale)}</span>
                </div>
              )}
              {booking.homeServiceFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">{t('provider.bookingDetail.homeServiceFee')}</span>
                  <span className="text-content">+{formatPrice(booking.homeServiceFee, locale)}</span>
                </div>
              )}
              <div className="border-t border-hairline pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-content font-medium">{t('provider.bookingDetail.total')}</span>
                  <span className="text-xl font-bold text-content">{formatPrice(booking.finalPrice, locale)}</span>
                </div>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">{t('provider.bookingDetail.paymentStatus')}</span>
                  <span className={cn(
                    'text-sm font-medium',
                    booking.paymentStatus === 'paid' ? 'text-green-400 light:text-green-700' :
                    booking.paymentStatus === 'pending' ? 'text-yellow-400 light:text-yellow-700' :
                    'text-content-muted'
                  )}>
                    {paymentStatusLabel(t, booking.paymentStatus)}
                  </span>
                </div>
              </div>
              {/* After "Pagamento ricevuto" the client confirms the service was received. */}
              {booking.paymentConfirmation && (
                <div className="flex items-center justify-between" data-testid="client-confirmation">
                  <span className="text-content-muted">
                    {t('provider.bookingDetail.clientConfirmation')}
                  </span>
                  <span className={cn(
                    'text-sm font-medium',
                    booking.paymentConfirmation.clientResponse === 'confirmed' ? 'text-green-400 light:text-green-700' :
                    booking.paymentConfirmation.clientResponse === 'disputed' ? 'text-red-400 light:text-red-700' :
                    booking.paymentConfirmation.autoConfirmed ? 'text-content-muted' :
                    'text-yellow-400 light:text-yellow-700'
                  )}>
                    {t(
                      booking.paymentConfirmation.clientResponse === 'confirmed' ? 'provider.bookingDetail.clientConfirmation.confirmed' :
                      booking.paymentConfirmation.clientResponse === 'disputed' ? 'provider.bookingDetail.clientConfirmation.disputed' :
                      booking.paymentConfirmation.autoConfirmed ? 'provider.bookingDetail.clientConfirmation.auto' :
                      'provider.bookingDetail.clientConfirmation.pending'
                    )}
                  </span>
                </div>
              )}
              {booking.depositPaid && (
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">{t('provider.bookingDetail.deposit')}</span>
                  <span className="text-green-400 light:text-green-700">{t('provider.bookingDetail.depositPaid')}</span>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
            <h3 className="text-lg font-semibold text-content mb-4">{t('provider.bookingDetail.history')}</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-section-primary mt-2" />
                <div>
                  <p className="text-sm text-content">{t('provider.bookingDetail.historyCreated')}</p>
                  <p className="text-xs text-content-muted">
                    {formatDateTime(booking.createdAt)}
                  </p>
                </div>
              </div>
              {booking.confirmedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-2" />
                  <div>
                    <p className="text-sm text-content">{t('provider.bookingDetail.historyConfirmed')}</p>
                    <p className="text-xs text-content-muted">
                      {formatDateTime(booking.confirmedAt)}
                    </p>
                  </div>
                </div>
              )}
              {booking.completedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
                  <div>
                    <p className="text-sm text-content">{t('provider.bookingDetail.historyCompleted')}</p>
                    <p className="text-xs text-content-muted">
                      {formatDateTime(booking.completedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button variant="secondary" fullWidth>
              <MessageSquare className="w-4 h-4 mr-2" />
              {t('provider.bookingDetail.messageClient')}
            </Button>
            <Button variant="outline" fullWidth>
              <FileText className="w-4 h-4 mr-2" />
              {t('provider.bookingDetail.downloadInvoice')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
