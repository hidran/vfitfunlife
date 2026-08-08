'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Download, Calendar, ChevronDown } from 'lucide-react';
import { BookingTable } from '@/components/provider/BookingTable';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { BookingFilters, ProviderBooking } from '@/types/provider';
import { BookingStatus } from '@/types/firebase';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function ProviderBookingsPage() {
  const { t, locale } = useI18n();
  const { bookings, isLoadingBookings, fetchBookings, confirmBooking, completeBooking, cancelBooking } = useProviderStore();
  const [activeTab, setActiveTab] = useState<BookingStatus | 'all'>('all');

  const TABS: { id: BookingStatus | 'all'; label: string }[] = [
    { id: 'all', label: t('provider.bookings.tab.all') },
    { id: 'requested', label: t('provider.bookings.tab.pending') },
    { id: 'accepted', label: t('provider.bookings.tab.confirmed') },
    { id: 'completed', label: t('provider.bookings.tab.completed') },
    { id: 'cancelled_by_trainer', label: t('provider.bookings.tab.cancelled') },
  ];
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});

  useEffect(() => {
    const filters: BookingFilters = {
      status: activeTab,
      searchQuery: searchQuery || undefined,
      ...dateRange,
    };
    fetchBookings(filters);
  }, [activeTab, fetchBookings, searchQuery, dateRange]);

  const handleSelect = (id: string, selected: boolean) => {
    if (selected) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(bookings.map(b => b.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleConfirm = async (id: string) => {
    await confirmBooking(id);
  };

  const handleComplete = async (id: string) => {
    await completeBooking(id);
  };

  const handleCancel = async (id: string) => {
    if (confirm(t('provider.bookings.confirm.cancel'))) {
      await cancelBooking(id);
    }
  };

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale));
  };

  const formatTime = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString(toLocaleTag(locale));
  };

  const handleExport = () => {
    // Export to CSV
    const headers = ['Client', 'Service', 'Date', 'Time', 'Status', 'Price'];
    const rows = bookings.map(b => [
      b.userName,
      b.serviceName,
      formatDate(b.scheduledAt),
      formatTime(b.scheduledAt),
      b.status,
      b.finalPrice,
    ]);
    
    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookings.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('provider.bookings.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('provider.bookings.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <Button variant="secondary" size="sm">
              {t('provider.bookings.btn.bulkActions', { count: selectedIds.length })}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('provider.bookings.btn.export')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === tab.id
                ? 'bg-section-gradient text-white'
                : 'bg-surface-elevated text-gray-400 hover:text-content'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('provider.bookings.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-elevated border border-hairline rounded-lg pl-10 pr-4 py-2.5 text-content placeholder-gray-500 outline-none focus:border-section-primary"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-surface-2' : ''}
        >
          <Filter className="w-4 h-4 mr-2" />
          {t('provider.bookings.btn.filters')}
          <ChevronDown className={cn('w-4 h-4 ml-2 transition-transform', showFilters && 'rotate-180')} />
        </Button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-surface-elevated rounded-xl border border-hairline p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('provider.bookings.filter.dateRange')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.valueAsDate || undefined }))}
                  className="flex-1 bg-surface-input border border-hairline rounded-lg px-3 py-2 text-content outline-none focus:border-section-primary"
                />
                <span className="text-gray-400">{t('provider.bookings.filter.dateTo')}</span>
                <input
                  type="date"
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.valueAsDate || undefined }))}
                  className="flex-1 bg-surface-input border border-hairline rounded-lg px-3 py-2 text-content outline-none focus:border-section-primary"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setDateRange({});
                  setSearchQuery('');
                }}
                fullWidth
              >
                {t('provider.bookings.filter.clear')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings Table */}
      <BookingTable
        bookings={bookings}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onComplete={handleComplete}
        onView={(id) => window.location.href = `/provider/bookings/${id}`}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        loading={isLoadingBookings}
      />
    </div>
  );
}
