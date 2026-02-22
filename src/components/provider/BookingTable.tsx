'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MoreVertical, Check, X, Calendar, Clock, User } from 'lucide-react';
import { ProviderBooking, BookingFilters } from '@/types/provider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { BookingStatus } from '@/types/firebase';
import { cn } from '@/lib/utils';

interface BookingTableProps {
  bookings: ProviderBooking[];
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  onComplete?: (id: string) => void;
  onView?: (id: string) => void;
  onMessage?: (id: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  loading?: boolean;
}

const STATUS_BADGES: Record<BookingStatus, { variant: any; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  confirmed: { variant: 'success', label: 'Confirmed' },
  in_progress: { variant: 'info', label: 'In Progress' },
  completed: { variant: 'default', label: 'Completed' },
  cancelled: { variant: 'error', label: 'Cancelled' },
  no_show: { variant: 'error', label: 'No Show' },
};

export function BookingTable({
  bookings,
  onConfirm,
  onCancel,
  onComplete,
  onView,
  onMessage,
  selectedIds = [],
  onSelect,
  onSelectAll,
  loading = false,
}: BookingTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isAllSelected = bookings.length > 0 && selectedIds.length === bookings.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < bookings.length;

  if (loading) {
    return (
      <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-section-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-12 text-center">
        <div className="w-16 h-16 bg-[#1A1D29] rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No bookings found</h3>
        <p className="text-gray-400">Try adjusting your filters or check back later.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5 bg-[#1A1D29]/50">
              {onSelect && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-transparent text-section-primary focus:ring-section-primary"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Client</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Service</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Date & Time</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Price</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {bookings.map((booking) => {
              const isSelected = selectedIds.includes(booking.id);
              const statusBadge = STATUS_BADGES[booking.status];

              return (
                <tr
                  key={booking.id}
                  className={cn(
                    'hover:bg-[#1A1D29]/30 transition-colors',
                    isSelected && 'bg-section-primary/5'
                  )}
                >
                  {onSelect && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelect(booking.id, e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-transparent text-section-primary focus:ring-section-primary"
                      />
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      {booking.clientPhotoUrl ? (
                        <Image
                          src={booking.clientPhotoUrl}
                          alt={booking.userName}
                          width={40}
                          height={40}
                          unoptimized
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#1A1D29] flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">{booking.userName}</p>
                        <p className="text-sm text-gray-400">{booking.userEmail || booking.userPhone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-white">{booking.serviceName}</p>
                    <p className="text-sm text-gray-400">{booking.durationMinutes} min</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-gray-300">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span>{formatDate(booking.scheduledAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400 text-sm mt-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(booking.scheduledAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-white font-medium">€{booking.finalPrice.toFixed(2)}</p>
                    {booking.depositPaid && (
                      <p className="text-xs text-green-400">Deposit paid</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={statusBadge.variant} size="sm">
                      {statusBadge.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {booking.status === 'pending' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onConfirm?.(booking.id)}
                            className="px-3 py-1.5"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCancel?.(booking.id)}
                            className="px-3 py-1.5 border-red-500/50 text-red-400 hover:bg-red-500/10"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </>
                      )}
                      {booking.status === 'confirmed' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onComplete?.(booking.id)}
                          className="px-3 py-1.5"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Complete
                        </Button>
                      )}
                      
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === booking.id ? null : booking.id)}
                          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                        
                        {openMenuId === booking.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-[#1A1D29] rounded-lg border border-white/10 shadow-xl z-10 py-1">
                            <button
                              onClick={() => {
                                onView?.(booking.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/5"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                onMessage?.(booking.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/5"
                            >
                              Message Client
                            </button>
                            {(booking.status === 'confirmed' || booking.status === 'pending') && (
                              <button
                                onClick={() => {
                                  onCancel?.(booking.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                              >
                                Cancel Booking
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
