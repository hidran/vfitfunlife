'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores/providerStore';

export default function ClientDetailClient() {
  const searchParams = useSearchParams();
  const clientId = searchParams?.get('id') ?? undefined;

  const {
    currentClient: client,
    clientBookingHistory: bookingHistory,
    isLoading,
    fetchClientDetails,
  } = useProviderStore();

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'notes'>('overview');

  useEffect(() => {
    if (clientId) {
      void fetchClientDetails(clientId);
    }
  }, [clientId, fetchClientDetails]);

  useEffect(() => {
    if (client) {
      setEditedNotes(client.notes ?? '');
    }
  }, [client]);

  if (!clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-secondary">Client non specificato</p>
      </div>
    );
  }

  if (isLoading || !client) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  const handleSaveNotes = () => {
    setIsEditingNotes(false);
  };

  const formatDate = (date: Date | { toDate(): Date } | undefined) => {
    if (!date) return 'Never';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const STATUS_COLORS = {
    completed: 'bg-green-500/20 text-green-400',
    confirmed: 'bg-blue-500/20 text-blue-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    cancelled: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/provider/clients"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </Link>

      {/* Profile Header */}
      <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {client.photoUrl ? (
            <Image
              src={client.photoUrl}
              alt={client.name}
              width={96}
              height={96}
              unoptimized
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-section-gradient flex items-center justify-center">
              <span className="text-3xl font-bold text-white">
                {client.name.charAt(0)}
              </span>
            </div>
          )}

          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{client.name}</h1>
            <div className="flex flex-col sm:flex-row gap-4 mt-3">
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
                <Mail className="w-4 h-4" />
                {client.email}
              </a>
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
                  <Phone className="w-4 h-4" />
                  {client.phone}
                </a>
              )}
            </div>

            {client.tags && (
              <div className="flex flex-wrap gap-2 mt-4">
                {client.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-section-primary/20 text-section-primary rounded-full text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary">
              <MessageSquare className="w-4 h-4 mr-2" />
              Message
            </Button>
            <Button>
              <Calendar className="w-4 h-4 mr-2" />
              Book Session
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
          <div>
            <p className="text-2xl font-bold text-white">{client.totalBookings}</p>
            <p className="text-sm text-gray-400">Total Bookings</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">€{client.totalSpent}</p>
            <p className="text-sm text-gray-400">Total Spent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{formatDate(client.firstVisit)}</p>
            <p className="text-sm text-gray-400">First Visit</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{formatDate(client.lastVisit)}</p>
            <p className="text-sm text-gray-400">Last Visit</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5">
        {(['overview', 'history', 'notes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2',
              activeTab === tab
                ? 'text-white border-section-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Notes */}
            <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Notes</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                >
                  {isEditingNotes ? (
                    <><X className="w-4 h-4 mr-2" /> Cancel</>
                  ) : (
                    <><Edit className="w-4 h-4 mr-2" /> Edit</>
                  )}
                </Button>
              </div>

              {isEditingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-section-primary min-h-[150px]"
                  />
                  <Button onClick={handleSaveNotes} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Save Notes
                  </Button>
                </div>
              ) : (
                <p className="text-gray-300 leading-relaxed">
                  {client.notes || 'No notes added yet.'}
                </p>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {bookingHistory.slice(0, 3).map((entry) => (
                  <div
                    key={entry.booking.id}
                    className="flex items-center justify-between p-3 bg-[#1A1D29] rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-white">{entry.serviceName}</p>
                      <p className="text-sm text-gray-400">{formatDate(entry.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">€{entry.amount}</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded', STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS])}>
                        {entry.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h3 className="text-lg font-semibold text-white">Booking History</h3>
            </div>
            <div className="divide-y divide-white/5">
              {bookingHistory.map((entry) => (
                <div
                  key={entry.booking.id}
                  className="flex items-center justify-between p-4 hover:bg-[#1A1D29]/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#1A1D29] flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-section-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{entry.serviceName}</p>
                      <p className="text-sm text-gray-400">{formatDate(entry.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn('text-xs px-3 py-1 rounded-full', STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS])}>
                      {entry.status}
                    </span>
                    <p className="font-medium text-white">€{entry.amount}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">All Notes</h3>
              <Button variant="secondary" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Note
              </Button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#1A1D29] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">January 15, 2024</span>
                  <div className="flex gap-2">
                    <button className="p-1.5 text-gray-400 hover:text-white rounded">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-red-400 hover:text-red-300 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-gray-300">
                  Client mentioned knee pain during squats. Modified exercise to leg press instead.
                </p>
              </div>

              <div className="bg-[#1A1D29] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">January 10, 2024</span>
                  <div className="flex gap-2">
                    <button className="p-1.5 text-gray-400 hover:text-white rounded">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-red-400 hover:text-red-300 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-gray-300">
                  Excellent progress on core strength. Increased plank hold to 2 minutes.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
