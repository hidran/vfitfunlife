'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

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
  const { t } = useI18n();
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={cn('bg-[#2A2D3A] rounded-xl border border-white/5 p-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">{t('provider.earningsChart.title')}</h3>
          <p className="text-sm text-gray-400 mt-1">
            {t('provider.earningsChart.subtitle')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1A1D29] rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  timeRange === range
                    ? 'bg-section-gradient text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                {range === '7d' && t('provider.earningsChart.range.7d')}
                {range === '30d' && t('provider.earningsChart.range.30d')}
                {range === '90d' && t('provider.earningsChart.range.90d')}
                {range === '1y' && t('provider.earningsChart.range.1y')}
              </button>
            ))}
          </div>
          
          <div className="flex bg-[#1A1D29] rounded-lg p-1">
            <button
              onClick={() => setChartType('line')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                chartType === 'line' ? 'bg-white/10' : 'text-gray-400 hover:text-white'
              )}
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                chartType === 'bar' ? 'bg-white/10' : 'text-gray-400 hover:text-white'
              )}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1A1D29] rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            {t('provider.earningsChart.stat.totalEarnings')}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              €{stats.totalEarnings.toFixed(2)}
            </span>
            <span className={cn(
              'text-xs font-medium flex items-center gap-0.5',
              stats.trend >= 0 ? 'text-green-400' : 'text-red-400'
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
        
        <div className="bg-[#1A1D29] rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <BarChart3 className="w-4 h-4" />
            {t('provider.earningsChart.stat.totalBookings')}
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalBookings}</p>
        </div>
        
        <div className="bg-[#1A1D29] rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            {t('provider.earningsChart.stat.avgPerBooking')}
          </div>
          <p className="text-2xl font-bold text-white">
            €{stats.avgEarnings.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64">
        {filteredData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400">{t('provider.earningsChart.noData')}</p>
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
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-[#1A1D29] rounded-lg border border-white/10 p-2 text-xs whitespace-nowrap">
                      <p className="text-gray-400">{formatDate(item.date)}</p>
                      <p className="text-green-400 font-medium">
                        €{item.earnings.toFixed(2)}
                      </p>
                      <p className="text-blue-400 font-medium">
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
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 -translate-x-full pr-2">
          <span>€{maxEarnings}</span>
          <span>€{(maxEarnings / 2).toFixed(0)}</span>
          <span>€0</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-500">
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
