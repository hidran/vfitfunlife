'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Download, Calendar, ChevronDown } from 'lucide-react';
import { BookingTable } from '@/components/provider/BookingTable';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { BookingFilters, ProviderBooking } from '@/types/provider';
import { BookingStatus } from '@/types/firebase';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS: { id: BookingStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function ProviderBookingsPage() {
  const { bookings, isLoadingBookings, fetchBookings, confirmBooking, completeBooking, cancelBooking } = useProviderStore();
  const [activeTab, setActiveTab] = useState<BookingStatus | 'all'>('all');
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
    if (confirm('Are you sure you want to cancel this booking?')) {
      await cancelBooking(id);
    }
  };

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString();
  };

  const formatTime = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString();
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
          <h1 className="text-2xl font-bold text-white">Bookings</h1>
          <p className="text-gray-400 mt-1">
            Manage and track all your appointments
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <Button variant="secondary" size="sm">
              Bulk Actions ({selectedIds.length})
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
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
                : 'bg-[#2A2D3A] text-gray-400 hover:text-white'
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
            placeholder="Search by client name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#2A2D3A] border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-section-primary"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-white/10' : ''}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
          <ChevronDown className={cn('w-4 h-4 ml-2 transition-transform', showFilters && 'rotate-180')} />
        </Button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Date Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.valueAsDate || undefined }))}
                  className="flex-1 bg-[#1A1D29] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-section-primary"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="date"
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.valueAsDate || undefined }))}
                  className="flex-1 bg-[#1A1D29] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-section-primary"
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
                Clear Filters
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
