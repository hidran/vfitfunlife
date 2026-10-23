'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { AvailabilityPicker } from '@/components/booking/AvailabilityPicker';
import { useAuthStore } from '@/stores/authStore';
import { useBookingStore } from '@/stores/bookingStore';
import { useBookableDays } from '@/hooks/useBookableDays';
import { useI18n } from '@/hooks/useI18n';
import { formatPrice } from '@/lib/utils';
import { loginHref } from '@/lib/auth/returnTo';
import { toLocaleTag } from '@/types/locale';
import type { ProviderSearchResult, Service } from '@/types/booking';

interface BookServiceSheetProps {
  /** The provider whose page the sheet was opened on, in the booking flow's shape. */
  provider: ProviderSearchResult;
  service: Service;
  /** This page, so a signed-out customer can come back to it after signing in. */
  returnToPath: string;
  onClose: () => void;
}

/**
 * Books one of a provider's services without leaving their profile: pick a day and a time
 * here, then confirm on `/booking/confirm`, which reads the same booking-store selection the
 * `/book` page fills in.
 *
 * The store is primed with this provider and service when the sheet opens. Fetching slots
 * needs a signed-in user (the getProviderSlots callable), so a visitor gets the sign-in
 * notice the `/book` page shows, with `?next=` pointing back at this page.
 */
export function BookServiceSheet({ provider, service, returnToPath, onClose }: BookServiceSheetProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const titleId = useId();

  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const authReady = useAuthStore((s) => s.isInitialized);

  const selectedProviderId = useBookingStore((s) => s.selectedProvider?.id);
  const selectedService = useBookingStore((s) => s.selectedService);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const selectedTime = useBookingStore((s) => s.selectedTime);
  const availability = useBookingStore((s) => s.availability);
  const isLoadingAvailability = useBookingStore((s) => s.isLoadingAvailability);
  const availabilityError = useBookingStore((s) => s.availabilityError);
  const ensureSelectedProvider = useBookingStore((s) => s.ensureSelectedProvider);
  const selectService = useBookingStore((s) => s.selectService);
  const selectDateTime = useBookingStore((s) => s.selectDateTime);
  const fetchAvailability = useBookingStore((s) => s.fetchAvailability);

  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const handleMonthChange = useCallback((month: Date) => setCalendarMonth(month), []);

  // Prime the flow once per provider+service. Depending on the objects would re-run whenever
  // the caller re-creates them, wiping the day and time the customer just picked.
  const primed = useRef<string | null>(null);
  useEffect(() => {
    const key = `${provider.id}:${service.id}`;
    if (primed.current === key) return;
    primed.current = key;
    ensureSelectedProvider(provider);
    selectService(service);
  }, [provider, service, ensureSelectedProvider, selectService]);

  const isOwnProvider = firebaseUser?.uid === provider.id;
  const providerSelected = selectedProviderId === provider.id;
  const serviceSelected = selectedService?.id === service.id;

  useEffect(() => {
    if (!providerSelected || !serviceSelected || !selectedDate || !firebaseUser || isOwnProvider) return;
    void fetchAvailability(provider.id, service.id, selectedDate);
  }, [
    providerSelected,
    serviceSelected,
    selectedDate,
    firebaseUser,
    isOwnProvider,
    provider.id,
    service.id,
    fetchAvailability,
  ]);

  const { data: bookableDays, isFetching: isCheckingDays } = useBookableDays(
    provider.id,
    service.id,
    calendarMonth,
    providerSelected && serviceSelected && !isOwnProvider && !!firebaseUser,
  );

  const signInNeeded = (authReady && !firebaseUser) || availabilityError === 'signin';
  const slotsNotice = signInNeeded ? (
    <>
      <p>{t('booking.availability.signInToSee')}</p>
      <Link
        href={loginHref(returnToPath)}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--section-primary)] px-5 font-semibold text-white"
      >
        {t('booking.availability.signIn')}
      </Link>
    </>
  ) : availabilityError === 'permission' ? (
    <p>{t('booking.availability.permissionError')}</p>
  ) : availabilityError === 'notFound' ? (
    <p>{t('booking.availability.notFoundError')}</p>
  ) : availabilityError === 'failed' ? (
    <p>{t('booking.availability.loadError')}</p>
  ) : null;

  const canContinue =
    providerSelected && serviceSelected && !isOwnProvider && !!selectedDate && !!selectedTime;
  const durationHours = Math.floor(service.durationMinutes / 60);
  const durationMins = service.durationMinutes % 60;
  const durationText =
    durationHours > 0
      ? `${durationHours}h${durationMins > 0 ? ` ${durationMins}m` : ''}`
      : `${durationMins} min`;

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      placement="bottom"
      className="w-full max-w-lg self-end rounded-t-3xl border border-hairline bg-background-dark p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:self-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-lg font-semibold text-content">
            {service.name}
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
            <Clock className="h-4 w-4 shrink-0 text-[var(--section-primary)]" aria-hidden="true" />
            {durationText}
            <span className="font-semibold text-[var(--section-primary)]">
              {formatPrice(service.price, locale)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-content/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isOwnProvider ? (
        <p role="alert" className="rounded-xl border border-hairline bg-surface-elevated/50 p-4 text-sm text-text-secondary">
          {t('booking.error.cannotBookOwnService')}
        </p>
      ) : signInNeeded ? (
        // The calendar would be dead weight: no slot can be fetched before signing in.
        <div className="rounded-xl border border-hairline bg-surface-elevated/50 p-4 text-center text-sm text-text-secondary">
          {slotsNotice}
        </div>
      ) : (
        <>
          <h3 className="mb-3 font-semibold text-content">{t('booking.services.selectDateTime')}</h3>
          <div className="max-h-[60dvh] overflow-y-auto scrollbar-hide">
            <AvailabilityPicker
              availability={availability}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onSelectDate={(date) => void selectDateTime(date, null)}
              onSelectTime={(time) => {
                if (selectedDate) void selectDateTime(selectedDate, time);
              }}
              isLoading={isLoadingAvailability}
              slotsNotice={slotsNotice}
              bookableDays={bookableDays}
              isCheckingDays={isCheckingDays}
              onMonthChange={handleMonthChange}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <p className="min-w-0 text-sm text-text-secondary">
              {selectedDate && selectedTime
                ? `${selectedDate.toLocaleDateString(toLocaleTag(locale), {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })} · ${selectedTime}`
                : t('booking.services.selectDateTime')}
            </p>
            <Button
              onClick={() => router.push('/booking/confirm')}
              disabled={!canContinue}
              className="flex-shrink-0"
            >
              {t('booking.action.continue')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
