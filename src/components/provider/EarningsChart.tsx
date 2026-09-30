'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';

interface ChartData {
  date: string;
  earnings: number;
  bookings: number;
}

interface EarningsChartProps {
  data: ChartData[];
  className?: string;
}

type ChartType = 'line' | 'bar';
type TimeRange = '7d' | '30d' | '90d' | '1y';

export function EarningsChart({ data, className }: EarningsChartProps) {
  const { t, locale } = useI18n();
  const [chartType, setChartType] = useState<ChartType>('line');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const filteredData = useMemo(() => {
    const now = new Date();
    let days = 30;
    switch (timeRange) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      case '1y': days = 365; break;
    }
    
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return data.filter(d => new Date(d.date) >= cutoffDate);
  }, [data, timeRange]);

  const stats = useMemo(() => {
    const totalEarnings = filteredData.reduce((sum, d) => sum + d.earnings, 0);
    const totalBookings = filteredData.reduce((sum, d) => sum + d.bookings, 0);
    const avgEarnings = totalBookings > 0 ? totalEarnings / totalBookings : 0;
    
    // Calculate trend
    const midPoint = Math.floor(filteredData.length / 2);
    const firstHalf = filteredData.slice(0, midPoint).reduce((sum, d) => sum + d.earnings, 0);
    const secondHalf = filteredData.slice(midPoint).reduce((sum, d) => sum + d.earnings, 0);
    const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    
    return { totalEarnings, totalBookings, avgEarnings, trend };
  }, [filteredData]);

  const maxEarnings = Math.max(...filteredData.map(d => d.earnings), 1);
  const maxBookings = Math.max(...filteredData.map(d => d.bookings), 1);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(toLocaleTag(locale), { month: 'short', day: 'numeric' });
  };

  /** Axis labels: whole euros in the active locale ("50 €" in it, "€50" in en). */
  const formatAxis = (amount: number) =>
    new Intl.NumberFormat(toLocaleTag(locale), {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className={cn('bg-surface-elevated rounded-xl border border-content/5 light:border-hairline p-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-content">{t('provider.earningsChart.title')}</h3>
          <p className="text-sm text-content-muted mt-1">
            {t('provider.earningsChart.subtitle')}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-surface-input rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  timeRange === range
                    ? 'bg-section-gradient text-white'
                    : 'text-content-muted hover:text-content'
                )}
              >
                {range === '7d' && t('provider.earningsChart.range.7d')}
                {range === '30d' && t('provider.earningsChart.range.30d')}
                {range === '90d' && t('provider.earningsChart.range.90d')}
                {range === '1y' && t('provider.earningsChart.range.1y')}
              </button>
            ))}
          </div>
          
          <div className="flex bg-surface-input rounded-lg p-1">
            <button
              onClick={() => setChartType('line')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                chartType === 'line' ? 'bg-content/10 text-content' : 'text-content-muted hover:text-content'
              )}
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                chartType === 'bar' ? 'bg-content/10 text-content' : 'text-content-muted hover:text-content'
              )}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-input rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            {t('provider.earningsChart.stat.totalEarnings')}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-content">
              {formatPrice(stats.totalEarnings, locale)}
            </span>
            <span className={cn(
              'text-xs font-medium flex items-center gap-0.5',
              stats.trend >= 0 ? 'text-green-400 light:text-green-700' : 'text-red-400 light:text-red-700'
            )}>
              {stats.trend >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(stats.trend).toFixed(1)}%
            </span>
          </div>
        </div>
        
        <div className="bg-surface-input rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <BarChart3 className="w-4 h-4" />
            {t('provider.earningsChart.stat.totalBookings')}
          </div>
          <p className="text-2xl font-bold text-content">{stats.totalBookings}</p>
        </div>
        
        <div className="bg-surface-input rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            {t('provider.earningsChart.stat.avgPerBooking')}
          </div>
          <p className="text-2xl font-bold text-content">
            {formatPrice(stats.avgEarnings, locale)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64">
        {filteredData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-content-muted">{t('provider.earningsChart.noData')}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-end gap-1">
            {filteredData.map((item, index) => {
              const earningsHeight = (item.earnings / maxEarnings) * 100;
              const bookingsHeight = (item.bookings / maxBookings) * 100;
              
              return (
                <div
                  key={item.date}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                >
                  {/* Tooltip */}
                  {/* display:none until hover: an invisible tooltip still widens the page, and
                      edge bars anchor it inward so it stays on screen. */}
                  <div
                    className={cn(
                      'absolute bottom-full mb-2 hidden group-hover:block pointer-events-none z-10',
                      index < filteredData.length / 3
                        ? 'left-0'
                        : index >= (filteredData.length * 2) / 3
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2'
                    )}
                  >
                    <div className="bg-surface-input rounded-lg border border-hairline p-2 text-xs whitespace-nowrap">
                      <p className="text-content-muted">{formatDate(item.date)}</p>
                      <p className="text-green-400 light:text-green-700 font-medium">
                        {formatPrice(item.earnings, locale)}
                      </p>
                      <p className="text-blue-400 light:text-blue-700 font-medium">
                        {t('provider.earningsChart.tooltip.bookings', { count: item.bookings })}
                      </p>
                    </div>
                  </div>
                  
                  {chartType === 'bar' ? (
                    <div
                      className="w-full bg-section-gradient/50 rounded-t-sm transition-all duration-300 hover:bg-section-gradient"
                      style={{ height: `${Math.max(earningsHeight, 5)}%` }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-end">
                      {index < filteredData.length - 1 && (
                        <svg
                          className="absolute inset-0 w-full h-full"
                          preserveAspectRatio="none"
                        >
                          <line
                            x1={`${(index / (filteredData.length - 1)) * 100}%`}
                            y1={`${100 - (item.earnings / maxEarnings) * 100}%`}
                            x2={`${((index + 1) / (filteredData.length - 1)) * 100}%`}
                            y2={`${100 - (filteredData[index + 1].earnings / maxEarnings) * 100}%`}
                            stroke="url(#lineGradient)"
                            strokeWidth="2"
                          />
                          <defs>
                            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="var(--section-primary)" />
                              <stop offset="100%" stopColor="var(--section-secondary)" />
                            </linearGradient>
                          </defs>
                        </svg>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-content-faint light:text-content-muted -translate-x-full pr-2">
          <span>{formatAxis(maxEarnings)}</span>
          <span>{formatAxis(maxEarnings / 2)}</span>
          <span>{formatAxis(0)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-content-faint light:text-content-muted">
        {filteredData.length > 0 && (
          <>
            <span>{formatDate(filteredData[0].date)}</span>
            <span>{formatDate(filteredData[Math.floor(filteredData.length / 2)].date)}</span>
            <span>{formatDate(filteredData[filteredData.length - 1].date)}</span>
          </>
        )}
      </div>
    </div>
  );
}
