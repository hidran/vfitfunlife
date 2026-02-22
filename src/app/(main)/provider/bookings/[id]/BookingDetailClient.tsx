'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
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
import { cn } from '@/lib/utils';

const STATUS_BADGES = {
  pending: { variant: 'warning' as const, label: 'Pending' },
  confirmed: { variant: 'success' as const, label: 'Confirmed' },
  in_progress: { variant: 'info' as const, label: 'In Progress' },
  completed: { variant: 'default' as const, label: 'Completed' },
  cancelled: { variant: 'error' as const, label: 'Cancelled' },
  no_show: { variant: 'error' as const, label: 'No Show' },
};

export default function BookingDetailClient() {
  const { id } = useParams<{ id: string }>();
  const { bookings, confirmBooking, completeBooking, cancelBooking } = useProviderStore();
  const booking = bookings.find((entry) => entry.id === id);
  const [showNotes, setShowNotes] = useState(false);
  const [privateNotes, setPrivateNotes] = useState('');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#2A2D3A] rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Booking not found</h2>
          <Link href="/provider/bookings">
            <Button variant="secondary" className="mt-4">
              Back to Bookings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    await confirmBooking(booking.id);
  };

  const handleComplete = async () => {
    await completeBooking(booking.id);
  };

  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      await cancelBooking(booking.id);
    }
  };

  const formatDate = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (date: Date | { toDate(): Date } | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleString('en-US');
  };

  const statusBadge = STATUS_BADGES[booking.status];

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/provider/bookings"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bookings
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">Booking Details</h1>
            <Badge variant={statusBadge.variant} size="md">
              {statusBadge.label}
            </Badge>
          </div>
          <p className="text-gray-400">
            Booking ID: {booking.id}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {booking.status === 'pending' && (
            <>
              <Button onClick={handleConfirm}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm
              </Button>
              <Button variant="outline" onClick={handleCancel} className="border-red-500/50 text-red-400 hover:bg-red-500/10">
                <XCircle className="w-4 h-4 mr-2" />
                Decline
              </Button>
            </>
          )}
          {booking.status === 'confirmed' && (
            <>
              <Button onClick={handleComplete}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark Complete
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowRescheduleModal(true)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reschedule
              </Button>
            </>
          )}
          {(booking.status === 'confirmed' || booking.status === 'pending') && (
            <Button variant="outline" onClick={handleCancel} className="border-red-500/50 text-red-400 hover:bg-red-500/10">
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Card */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Client Information</h3>
            <div className="flex items-start gap-4">
              {booking.clientPhotoUrl ? (
                <Image
                  src={booking.clientPhotoUrl}
                  alt={booking.userName}
                  width={64}
                  height={64}
                  unoptimized
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-section-gradient flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
              )}
              <div className="flex-1">
                <h4 className="text-xl font-medium text-white">{booking.userName}</h4>
                <div className="flex flex-col gap-1 mt-2">
                  {booking.userEmail && (
                    <a href={`mailto:${booking.userEmail}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
                      <Mail className="w-4 h-4" />
                      {booking.userEmail}
                    </a>
                  )}
                  <a href={`tel:${booking.userPhone}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
                    <Phone className="w-4 h-4" />
                    {booking.userPhone}
                  </a>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Link href={`/provider/clients/${booking.userId}`}>
                    <Button variant="secondary" size="sm">
                      <User className="w-4 h-4 mr-2" />
                      View Profile
                    </Button>
                  </Link>
                  <Button variant="secondary" size="sm">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Message
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Service Details */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Service Details</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Service</span>
                <span className="text-white font-medium">{booking.serviceName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Duration</span>
                <span className="text-white">{booking.durationMinutes} minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Type</span>
                <span className={cn(
                  'text-sm capitalize',
                  booking.bookingType === 'virtual' && 'text-blue-400',
                  booking.bookingType === 'home_service' && 'text-green-400',
                  booking.bookingType === 'in_venue' && 'text-purple-400',
                )}>
                  {booking.bookingType.replace('_', ' ')}
                </span>
              </div>
              {booking.venueName && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Location</span>
                  <span className="text-white">{booking.venueName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Schedule</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1A1D29] flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-section-primary" />
                </div>
                <div>
                  <p className="text-white font-medium">{formatDate(booking.scheduledAt)}</p>
                  <p className="text-sm text-gray-400">Date</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1A1D29] flex items-center justify-center">
                  <Clock className="w-6 h-6 text-section-primary" />
                </div>
                <div>
                  <p className="text-white font-medium">
                    {formatTime(booking.scheduledAt)} - {formatTime(booking.scheduledEndAt)}
                  </p>
                  <p className="text-sm text-gray-400">Time</p>
                </div>
              </div>
            </div>
          </div>

          {/* Client Notes */}
          {booking.userNotes && (
            <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Client Notes</h3>
              <div className="bg-[#1A1D29] rounded-lg p-4">
                <p className="text-gray-300">{booking.userNotes}</p>
              </div>
            </div>
          )}

          {/* Private Notes */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Private Notes</h3>
              <Button variant="secondary" size="sm" onClick={() => setShowNotes(!showNotes)}>
                <Edit className="w-4 h-4 mr-2" />
                {showNotes ? 'Cancel' : 'Add Note'}
              </Button>
            </div>
            {showNotes ? (
              <div className="space-y-3">
                <textarea
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder="Add private notes about this client or booking..."
                  className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-section-primary min-h-[100px]"
                />
                <div className="flex gap-2">
                  <Button size="sm">Save Note</Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowNotes(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No private notes added yet.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Payment Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Original Price</span>
                <span className="text-white">€{booking.originalPrice.toFixed(2)}</span>
              </div>
              {booking.discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-green-400">-€{booking.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {booking.homeServiceFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Home Service Fee</span>
                  <span className="text-white">+€{booking.homeServiceFee.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-xl font-bold text-white">€{booking.finalPrice.toFixed(2)}</span>
                </div>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Payment Status</span>
                  <span className={cn(
                    'text-sm font-medium',
                    booking.paymentStatus === 'paid' ? 'text-green-400' :
                    booking.paymentStatus === 'pending' ? 'text-yellow-400' :
                    'text-gray-400'
                  )}>
                    {booking.paymentStatus.replace('_', ' ')}
                  </span>
                </div>
              </div>
              {booking.depositPaid && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Deposit</span>
                  <span className="text-green-400">Paid</span>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">History</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-section-primary mt-2" />
                <div>
                  <p className="text-sm text-white">Booking created</p>
                  <p className="text-xs text-gray-400">
                    {formatDateTime(booking.createdAt)}
                  </p>
                </div>
              </div>
              {booking.confirmedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-2" />
                  <div>
                    <p className="text-sm text-white">Booking confirmed</p>
                    <p className="text-xs text-gray-400">
                      {formatDateTime(booking.confirmedAt)}
                    </p>
                  </div>
                </div>
              )}
              {booking.completedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
                  <div>
                    <p className="text-sm text-white">Booking completed</p>
                    <p className="text-xs text-gray-400">
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
              Message Client
            </Button>
            <Button variant="outline" fullWidth>
              <FileText className="w-4 h-4 mr-2" />
              Download Invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
