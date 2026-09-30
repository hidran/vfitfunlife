'use client';

/**
 * "Aggiungi appuntamento" — the trainer books a session for one of their own clients.
 *
 * Clients come from the trainer's roster (`clients`, kept in sync with bookings by the
 * syncClientRosterOnBookingWrite trigger), services from instructors/{uid}/services, and the
 * times from getProviderSlots — the same slot engine the customer /book flow uses, asked with
 * `asTrainer` so the customer-facing minimum notice does not hide later-today slots. The
 * server (createBookingAsTrainer) re-checks all of it. A client not yet on the roster can be
 * added by email right here (AddClientByEmail → addClientByEmail callable).
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { getProviderClients } from '@/lib/firebase/provider';
import { fetchProviderServices } from '@/lib/firebase/providers';
import { fetchProviderSlots, type ProviderSlot } from '@/lib/firebase/availability';
import { createBookingAsTrainer } from '@/lib/firebase/functions';
import { romeDateKey } from '@/lib/availability/dates';
import { BOOKING_NOTE_MAX_LENGTH } from '@/lib/bookingNote';
import type { ProviderClient } from '@/types/provider';
import type { InstructorService } from '@/types/instructor';
import { ScheduleSheet, callableErrorMessage, fieldClass } from './ScheduleSheet';
import { AddClientByEmail } from '../AddClientByEmail';

interface AddAppointmentSheetProps {
  instructorId: string;
  /** "YYYY-MM-DD" — the day the trainer tapped. */
  initialDate: string;
  onClose: () => void;
  /** After the booking exists; the page refreshes the calendar. */
  onCreated: () => void;
  /**
   * "Blocca solo l'orario": the page swaps this sheet for BlockTimeSheet on the given day
   * (the block logic lives there only). Without it the option is not offered.
   */
  onSwitchToBlock?: (date: string) => void;
}

/** Who the appointment is for — or no one ("block"), which hands over to BlockTimeSheet. */
type ClientMode = 'existing' | 'new';

type SlotsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; slots: ProviderSlot[] };

/** One entry per person: a roster can hold two docs for the same user (seeded + derived). */
function bookableClients(clients: ProviderClient[]): ProviderClient[] {
  const seen = new Set<string>();
  return clients
    .filter((c) => {
      if (!c.userId || seen.has(c.userId)) return false;
      seen.add(c.userId);
      return true;
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

export function AddAppointmentSheet({
  instructorId,
  initialDate,
  onClose,
  onCreated,
  onSwitchToBlock,
}: AddAppointmentSheetProps) {
  const { t } = useI18n();
  const ids = {
    client: useId(),
    service: useId(),
    date: useId(),
    time: useId(),
    note: useId(),
    mode: useId(),
    missing: useId(),
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [clients, setClients] = useState<ProviderClient[]>([]);
  const [services, setServices] = useState<InstructorService[]>([]);

  const [mode, setMode] = useState<ClientMode>('existing');
  const [clientUserId, setClientUserId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<SlotsState>({ kind: 'idle' });
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slotRequest = useRef(0);

  /** After "Nuovo cliente (email)" added someone: reload the roster and pick them. */
  const handleClientAdded = (added: { userId: string; name: string; email: string }) => {
    setClientUserId(added.userId);
    getProviderClients()
      .then((roster) => {
        const next = bookableClients(roster);
        // Keep the new client selectable even if the read raced the server write.
        if (!next.some((c) => c.userId === added.userId)) {
          next.push({ id: added.userId, userId: added.userId, name: added.name, email: added.email, totalBookings: 0, totalSpent: 0 });
        }
        setClients(next);
      })
      .catch(() => {
        setClients((prev) =>
          prev.some((c) => c.userId === added.userId)
            ? prev
            : [...prev, { id: added.userId, userId: added.userId, name: added.name, email: added.email, totalBookings: 0, totalSpent: 0 }],
        );
      });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProviderClients(), fetchProviderServices(instructorId)])
      .then(([roster, catalogue]) => {
        if (cancelled) return;
        const bookable = bookableClients(roster);
        setClients(bookable);
        // Nobody to pick yet: start on adding one.
        if (bookable.length === 0) setMode('new');
        setServices(catalogue.filter((s) => s.isActive !== false));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instructorId]);

  const loadSlots = (nextServiceId: string, nextDate: string) => {
    setStartsAt('');
    if (!nextServiceId || !nextDate) {
      setSlots({ kind: 'idle' });
      return;
    }
    const request = ++slotRequest.current;
    setSlots({ kind: 'loading' });
    fetchProviderSlots({ instructorId, serviceId: nextServiceId, date: nextDate, asTrainer: true })
      .then((found) => {
        if (request === slotRequest.current) setSlots({ kind: 'ready', slots: found });
      })
      .catch(() => {
        if (request === slotRequest.current) setSlots({ kind: 'error' });
      });
  };

  const canSubmit = Boolean(clientUserId && serviceId && startsAt) && !submitting;
  const missing = [
    !clientUserId && t('provider.schedule.add.missing.client'),
    !serviceId && t('provider.schedule.add.missing.service'),
    !startsAt && t('provider.schedule.add.missing.time'),
  ].filter((m): m is string => Boolean(m));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await createBookingAsTrainer({
        clientUserId,
        serviceId,
        startsAt,
        ...(trimmed ? { note: trimmed } : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      const message = callableErrorMessage(err);
      if (message.includes('slot_unavailable') || message.includes('past_start')) {
        setError(t('provider.schedule.add.error.slot'));
        loadSlots(serviceId, date);
      } else if (message.includes('not_your_client')) {
        setError(t('provider.schedule.add.error.notClient'));
      } else {
        setError(t('provider.schedule.add.error.generic'));
      }
      setSubmitting(false);
    }
  };

  return (
    <ScheduleSheet
      title={t('provider.schedule.add.title')}
      description={t('provider.schedule.add.subtitle')}
      busy={submitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting} className="flex-1 min-h-11">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={submitting}
            aria-describedby={!canSubmit && missing.length > 0 ? ids.missing : undefined}
            className="flex-1 min-h-11"
          >
            {t('provider.schedule.add.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p id={ids.mode} className="text-sm font-medium text-content">{t('provider.schedule.add.mode.label')}</p>
        <div
          role="group"
          aria-labelledby={ids.mode}
          className={cn('grid gap-1 rounded-lg border border-hairline p-1', onSwitchToBlock ? 'grid-cols-3' : 'grid-cols-2')}
        >
          {(
            [
              ['existing', t('provider.schedule.add.mode.existing')],
              ['new', t('provider.schedule.add.mode.new')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={submitting}
              onClick={() => {
                if (value === mode) return;
                setMode(value);
                // A client picked in the other mode would be invisible here.
                if (value === 'new') setClientUserId('');
              }}
              className={cn(
                'min-h-11 px-2 py-1 rounded-md text-xs sm:text-sm font-medium leading-tight transition-colors',
                mode === value
                  ? 'bg-[var(--section-primary)]/15 text-content'
                  : 'text-content-muted hover:text-content',
              )}
            >
              {label}
            </button>
          ))}
          {onSwitchToBlock && (
            <button
              type="button"
              aria-pressed={false}
              disabled={submitting}
              onClick={() => onSwitchToBlock(date || initialDate)}
              className="min-h-11 px-2 py-1 rounded-md text-xs sm:text-sm font-medium leading-tight text-content-muted hover:text-content transition-colors"
            >
              {t('provider.schedule.add.mode.block')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-content-muted" role="status">{t('common.loading')}</p>
      ) : loadError ? (
        <p className="text-sm text-error" role="alert">{t('provider.schedule.add.loadError')}</p>
      ) : (
        <div className="space-y-4">
          {mode === 'existing' ? (
            <div className="space-y-2">
              <label htmlFor={ids.client} className="text-sm font-medium text-content">
                {t('provider.schedule.add.client')}
              </label>
              {clients.length === 0 ? (
                <p className="text-sm text-content-muted">{t('provider.schedule.add.noClients')}</p>
              ) : (
                <select
                  id={ids.client}
                  value={clientUserId}
                  onChange={(e) => setClientUserId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">{t('provider.schedule.add.clientPlaceholder')}</option>
                  {clients.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name || c.email || c.userId}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {clients.length === 0 && (
                <p className="text-sm text-content-muted">{t('provider.schedule.add.noClients')}</p>
              )}
              <AddClientByEmail onAdded={handleClientAdded} />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor={ids.service} className="text-sm font-medium text-content">
              {t('provider.schedule.add.service')}
            </label>
            {services.length === 0 ? (
              <p className="text-sm text-content-muted">{t('provider.schedule.add.noServices')}</p>
            ) : (
              <select
                id={ids.service}
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  loadSlots(e.target.value, date);
                }}
                className={fieldClass}
              >
                <option value="">{t('provider.schedule.add.servicePlaceholder')}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t('provider.schedule.add.serviceOption', {
                      name: s.name,
                      duration: s.durationMinutes,
                      price: s.price,
                    })}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor={ids.date} className="text-sm font-medium text-content">
              {t('provider.schedule.add.date')}
            </label>
            <input
              id={ids.date}
              type="date"
              value={date}
              min={romeDateKey(new Date())}
              onChange={(e) => {
                setDate(e.target.value);
                loadSlots(serviceId, e.target.value);
              }}
              className={fieldClass}
            />
          </div>

          <fieldset className="space-y-2">
            <legend id={ids.time} className="text-sm font-medium text-content mb-2">
              {t('provider.schedule.add.time')}
            </legend>
            {slots.kind === 'idle' && (
              <p className="text-sm text-content-muted">{t('provider.schedule.add.pickServiceFirst')}</p>
            )}
            {slots.kind === 'loading' && (
              <p className="text-sm text-content-muted" role="status">{t('provider.schedule.add.loadingSlots')}</p>
            )}
            {slots.kind === 'error' && (
              <p className="text-sm text-error" role="alert">{t('provider.schedule.add.slotsError')}</p>
            )}
            {slots.kind === 'ready' && slots.slots.length === 0 && (
              <p className="text-sm text-content-muted">{t('provider.schedule.add.noSlots')}</p>
            )}
            {slots.kind === 'ready' && slots.slots.length > 0 && (
              <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby={ids.time}>
                {slots.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => setStartsAt(slot.startsAt)}
                    aria-pressed={startsAt === slot.startsAt}
                    className={cn(
                      'min-h-11 px-2 py-2 rounded-lg border text-sm font-medium transition-colors',
                      startsAt === slot.startsAt
                        ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/10 text-content'
                        : 'border-hairline text-content-muted hover:text-content',
                    )}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <label htmlFor={ids.note} className="text-sm font-medium text-content">
              {t('provider.schedule.add.note')}
            </label>
            <textarea
              id={ids.note}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, BOOKING_NOTE_MAX_LENGTH))}
              maxLength={BOOKING_NOTE_MAX_LENGTH}
              rows={3}
              className="w-full rounded-lg bg-surface border border-hairline px-3 py-2 text-content resize-none"
            />
          </div>
        </div>
      )}

      {!loading && !loadError && !submitting && missing.length > 0 && (
        <p id={ids.missing} className="text-sm text-content-muted">
          {t('provider.schedule.add.missing', { items: missing.join(', ') })}
        </p>
      )}

      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </ScheduleSheet>
  );
}
