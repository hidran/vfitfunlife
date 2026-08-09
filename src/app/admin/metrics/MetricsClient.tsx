'use client';

/**
 * The "Cruscotto" — Gate 1 progress at a glance.
 *
 * Reads `metrics_daily` snapshots and renders them. It deliberately computes nothing:
 * every number comes from the nightly Cloud Function, so the dashboard and any other
 * consumer can never disagree about what a metric means.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Euro, Users, XCircle } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { getPilotGates, getRecentMetrics, toWeeklyPoints } from '@/lib/firebase/metrics';
import { gateStatus, type MetricsDaily, type PilotGates } from '@/types/metrics';
import { WeeklyTrendChart } from '@/components/admin/metrics/WeeklyTrendChart';
import { Spinner } from '@/components/ui/Spinner';
import { toLocaleTag } from '@/types/locale';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';

const GATE_TONE = {
  green: 'border-success/40 bg-success/10 text-success',
  amber: 'border-warning/40 bg-warning/10 text-warning',
  red: 'border-error/40 bg-error/10 text-error',
} as const;

function StatTile(props: {
  label: string;
  value: string;
  hint?: string;
  progress?: { current: number; target: number };
  icon: React.ReactNode;
}) {
  const pct = props.progress
    ? Math.min(100, (props.progress.current / Math.max(1, props.progress.target)) * 100)
    : null;
  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-4">
      <div className="flex items-center gap-2 text-content-muted text-sm mb-2">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <p className="text-2xl font-bold text-content">{props.value}</p>
      {props.hint && <p className="text-xs text-content-muted mt-1">{props.hint}</p>}
      {pct !== null && (
        <div className="mt-3 h-2 rounded-full bg-surface overflow-hidden" role="presentation">
          <div
            className="h-full bg-[var(--section-primary)] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function MetricsClient() {
  const { t, locale } = useI18n();
  const [daily, setDaily] = useState<MetricsDaily[] | null>(null);
  const [gates, setGates] = useState<PilotGates | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Captured once on mount rather than read during render: reading the clock while
  // rendering is impure and makes the Gate banner non-deterministic across renders.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, g] = await Promise.all([getRecentMetrics(90), getPilotGates()]);
        if (cancelled) return;
        setDaily(d);
        setGates(g);
        setNow(new Date());
      } catch (e) {
        // Surfaced rather than swallowed: an empty dashboard that is actually a permission
        // error is indistinguishable from a pilot with no activity.
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const latest = daily?.[0] ?? null;
  const weekly = useMemo(() => (daily ? toWeeklyPoints([...daily].reverse(), 12) : []), [daily]);

  const last7 = useMemo(() => (daily ?? []).slice(0, 7), [daily]);
  const newClients7 = last7.reduce((s, d) => s + d.newClients, 0);
  const lateCancel7 = last7.reduce((s, d) => s + d.lateCancellations, 0);

  const fmtDate = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(toLocaleTag(locale), {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">
          {error}
        </div>
      </div>
    );
  }

  if (!daily) {
    return <div className="flex justify-center py-16"><Spinner size="md" /></div>;
  }

  if (!latest) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-content mb-2">{t('metrics.title' as MessageKey)}</h1>
        <div className="rounded-xl border border-hairline bg-surface-elevated p-6">
          <p className="font-semibold text-content">{t('metrics.empty.title' as MessageKey)}</p>
          <p className="text-sm text-content-muted mt-1">{t('metrics.empty.body' as MessageKey)}</p>
        </div>
      </div>
    );
  }

  const status = gates && now
    ? gateStatus({
      activeTrainers: latest.activeTrainers,
      completedSessions: latest.cumulativePaymentConfirmed,
      gates, now,
    })
    : 'amber';

  const daysLeft = gates && now
    ? Math.max(0, Math.ceil((gates.deadline.getTime() - now.getTime()) / 86400000))
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-content">{t('metrics.title' as MessageKey)}</h1>
        <p className="text-sm text-content-muted">{t('metrics.subtitle' as MessageKey)}</p>
        {/* Always state the as-of date: yesterday's figures presented as today's is exactly
            how a partners' meeting goes wrong. */}
        <p className="text-xs text-content-muted mt-1">
          {t('metrics.asOf' as MessageKey, { date: fmtDate(latest.dateKey) })}
          {latest.backfilled && ` · ${t('metrics.backfilled' as MessageKey)}`}
        </p>
      </header>

      {gates && (
        <section className={cn('rounded-xl border p-4 flex items-start gap-3', GATE_TONE[status])}>
          {status === 'green' ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
            : status === 'amber' ? <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              : <XCircle className="w-5 h-5 mt-0.5 shrink-0" />}
          <div>
            <p className="font-semibold">{t('metrics.gate1.title' as MessageKey)}</p>
            <p className="text-sm opacity-90">
              {t(`metrics.gate1.${status}` as MessageKey)}
              {' · '}
              {t('metrics.gate1.daysLeft' as MessageKey, { days: String(daysLeft) })}
            </p>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          icon={<CheckCircle className="w-4 h-4" />}
          label={t('metrics.card.completedSessions' as MessageKey)}
          value={`${latest.cumulativePaymentConfirmed}/${gates?.targetCompletedSessions ?? '—'}`}
          progress={gates ? { current: latest.cumulativePaymentConfirmed, target: gates.targetCompletedSessions } : undefined}
        />
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label={t('metrics.card.activeTrainers' as MessageKey)}
          value={`${latest.activeTrainers}/${gates?.targetActiveTrainers ?? '—'}`}
          hint={`${latest.totalTrainers} registrati`}
          progress={gates ? { current: latest.activeTrainers, target: gates.targetActiveTrainers } : undefined}
        />
        <StatTile
          icon={<Euro className="w-4 h-4" />}
          label={t('metrics.card.gmv' as MessageKey)}
          value={`${latest.cumulativeGrossValue.toFixed(0)} €`}
        />
        <StatTile
          icon={<Clock className="w-4 h-4" />}
          label={t('metrics.card.timeToAccept' as MessageKey)}
          value={latest.medianTimeToAcceptHours === null
            ? '—'
            : t('metrics.hours' as MessageKey, { n: latest.medianTimeToAcceptHours.toFixed(1) })}
        />
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label={t('metrics.card.rebooking' as MessageKey)}
          // A rate without its denominator is not defensible, so the cohort is always shown.
          value={latest.rebookingRate === null
            ? t('metrics.noCohort' as MessageKey)
            : `${Math.round(latest.rebookingRate * 100)}%`}
          hint={t('metrics.cohort' as MessageKey, { n: String(latest.rebookingCohort) })}
        />
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label={t('metrics.card.newClients' as MessageKey)}
          value={String(newClients7)}
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4" />}
          label={t('metrics.card.lateCancellations' as MessageKey)}
          value={String(lateCancel7)}
        />
        <StatTile
          icon={<XCircle className="w-4 h-4" />}
          label={t('metrics.card.disputes' as MessageKey)}
          value={String(latest.disputes)}
        />
      </section>

      <section className="bg-surface-elevated rounded-xl border border-hairline p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content mb-4">
          {t('metrics.trend.title' as MessageKey)}
        </h2>
        <WeeklyTrendChart data={weekly} />
      </section>

      <section className="bg-surface-elevated rounded-xl border border-hairline p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content mb-4">
          {t('metrics.funnel.title' as MessageKey)}
        </h2>
        <dl className="grid grid-cols-3 gap-4 text-center">
          {([
            ['metrics.funnel.registered', latest.funnel.registeredClients],
            ['metrics.funnel.requested', latest.funnel.clientsWithRequest],
            ['metrics.funnel.completed', latest.funnel.clientsWithCompleted],
          ] as const).map(([key, value]) => (
            <div key={key}>
              <dd className="text-2xl font-bold text-content">{value}</dd>
              <dt className="text-xs text-content-muted">{t(key as MessageKey)}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-surface-elevated rounded-xl border border-hairline p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content mb-4">
          {t('metrics.trainers.title' as MessageKey)}
        </h2>
        <TrainerTable latest={latest} />
      </section>
    </div>
  );
}

function TrainerTable({ latest }: { latest: MetricsDaily }) {
  const { t, locale } = useI18n();

  // Sorted by last activity ascending so inactive trainers surface first — spotting them
  // is the whole reason this table exists.
  const rows = Object.entries(latest.byTrainer).sort(([, a], [, b]) => {
    const at = a.lastAcceptedAt?.getTime() ?? 0;
    const bt = b.lastAcceptedAt?.getTime() ?? 0;
    return at - bt;
  });

  if (!rows.length) {
    return <p className="text-sm text-content-muted">{t('metrics.trainers.empty' as MessageKey)}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-content-muted border-b border-hairline">
            <th scope="col" className="py-2 pr-4">{t('metrics.trainers.name' as MessageKey)}</th>
            <th scope="col" className="py-2 pr-4">{t('metrics.trainers.accepted' as MessageKey)}</th>
            <th scope="col" className="py-2 pr-4">{t('metrics.trainers.completed' as MessageKey)}</th>
            <th scope="col" className="py-2 pr-4">{t('metrics.trainers.confirmed' as MessageKey)}</th>
            <th scope="col" className="py-2">{t('metrics.trainers.lastActive' as MessageKey)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([uid, tr]) => (
            <tr key={uid} className="border-b border-hairline/50">
              <td className="py-2 pr-4 text-content">{tr.name}</td>
              <td className="py-2 pr-4">{tr.accepted}</td>
              <td className="py-2 pr-4">{tr.completed}</td>
              <td className="py-2 pr-4">{tr.paymentConfirmed}</td>
              <td className={cn('py-2', !tr.lastAcceptedAt && 'text-warning')}>
                {tr.lastAcceptedAt
                  ? tr.lastAcceptedAt.toLocaleDateString(toLocaleTag(locale), {
                    day: 'numeric', month: 'short',
                  })
                  : t('metrics.trainers.never' as MessageKey)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
