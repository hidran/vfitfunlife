'use client';

/**
 * Weekly session trend, as inline SVG.
 *
 * Hand-rolled rather than pulling in a chart library: this is one grouped bar chart on a
 * mobile-first static export, and a ~100KB dependency for it would be a poor trade.
 *
 * The chart is not the only carrier of the data — the same numbers are rendered in a
 * visually-hidden table, so screen readers and copy-paste both work.
 */

import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

export interface WeeklyPoint {
  weekLabel: string;
  requested: number;
  accepted: number;
  completed: number;
  paid: number;
}

const SERIES = [
  { key: 'requested', tone: 'var(--chart-requested, #f59e0b)', labelKey: 'metrics.series.requested' },
  { key: 'accepted', tone: 'var(--chart-accepted, #3b82f6)', labelKey: 'metrics.series.accepted' },
  { key: 'completed', tone: 'var(--chart-completed, #10b981)', labelKey: 'metrics.series.completed' },
  { key: 'paid', tone: 'var(--chart-paid, #8b5cf6)', labelKey: 'metrics.series.paid' },
] as const;

const H = 180;
const PAD_BOTTOM = 24;
const PAD_LEFT = 28;

export function WeeklyTrendChart({ data }: { data: WeeklyPoint[] }) {
  const { t } = useI18n();

  if (!data.length) return null;

  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.requested, d.accepted, d.completed, d.paid]),
  );
  const groupWidth = 100 / data.length;
  const barWidth = groupWidth / (SERIES.length + 1);

  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">{t('metrics.trend.title' as MessageKey)}</figcaption>

      <div className="flex flex-wrap gap-3">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-content-muted">
            <span className="w-3 h-3 rounded-sm" style={{ background: s.tone }} aria-hidden />
            {t(s.labelKey as MessageKey)}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="w-full h-[180px] min-w-[320px]"
          role="img"
          aria-label={t('metrics.trend.title' as MessageKey)}
        >
          {/* Gridlines at 0, 50% and max, so bar heights are readable without axis ticks. */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD_LEFT / 4} x2={100}
              y1={(H - PAD_BOTTOM) * (1 - f)} y2={(H - PAD_BOTTOM) * (1 - f)}
              stroke="currentColor" strokeWidth={0.3} className="text-hairline"
            />
          ))}

          {data.map((point, i) => (
            <g key={point.weekLabel}>
              {SERIES.map((s, j) => {
                const value = point[s.key];
                const h = (value / max) * (H - PAD_BOTTOM);
                return (
                  <rect
                    key={s.key}
                    x={i * groupWidth + j * barWidth + barWidth / 2}
                    y={H - PAD_BOTTOM - h}
                    width={barWidth * 0.85}
                    height={h}
                    fill={s.tone}
                    rx={0.4}
                  >
                    <title>{`${point.weekLabel} — ${t(s.labelKey as MessageKey)}: ${value}`}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex justify-between text-[10px] text-content-muted px-1">
        {data.map((d) => (
          <span key={d.weekLabel}>{d.weekLabel}</span>
        ))}
      </div>

      {/* The chart must not be the only representation of the data. */}
      <table className="sr-only">
        <caption>{t('metrics.trend.title' as MessageKey)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('metrics.trend.week' as MessageKey)}</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">{t(s.labelKey as MessageKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.weekLabel}>
              <th scope="row">{d.weekLabel}</th>
              <td>{d.requested}</td>
              <td>{d.accepted}</td>
              <td>{d.completed}</td>
              <td>{d.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
