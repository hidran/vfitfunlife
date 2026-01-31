'use client';

import { useState, useEffect } from 'react';
import { Search, Users, Calendar, DollarSign, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { ProviderClient } from '@/types/provider';
import Link from 'next/link';

// Mock data for demo
const MOCK_CLIENTS: ProviderClient[] = [
  {
    id: '1',
    userId: 'user1',
    name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '+39 123 456 7890',
    totalBookings: 12,
    totalSpent: 850,
    lastVisit: new Date('2024-01-20'),
    firstVisit: new Date('2023-06-15'),
    notes: 'Prefers morning sessions',
  },
  {
    id: '2',
    userId: 'user2',
    name: 'Sarah Johnson',
    email: 'sarah.j@example.com',
    phone: '+39 234 567 8901',
    totalBookings: 8,
    totalSpent: 640,
    lastVisit: new Date('2024-01-18'),
    firstVisit: new Date('2023-08-22'),
    notes: 'Has knee issues - avoid high impact',
  },
  {
    id: '3',
    userId: 'user3',
    name: 'Michael Brown',
    email: 'mbrown@example.com',
    phone: '+39 345 678 9012',
    totalBookings: 5,
    totalSpent: 400,
    lastVisit: new Date('2024-01-15'),
    firstVisit: new Date('2023-11-10'),
  },
  {
    id: '4',
    userId: 'user4',
    name: 'Emma Davis',
    email: 'emma.davis@example.com',
    phone: '+39 456 789 0123',
    totalBookings: 20,
    totalSpent: 1800,
    lastVisit: new Date('2024-01-22'),
    firstVisit: new Date('2023-03-05'),
    notes: 'VIP client - priority scheduling',
  },
  {
    id: '5',
    userId: 'user5',
    name: 'James Wilson',
    email: 'j.wilson@example.com',
    totalBookings: 3,
    totalSpent: 240,
    firstVisit: new Date('2024-01-10'),
  },
];

export default function ProviderClientsPage() {
  const { clients, isLoadingClients, fetchClients } = useProviderStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Use mock data for now
  const displayClients = clients.length > 0 ? clients : MOCK_CLIENTS;

  const filteredClients = displayClients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date?: Date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-gray-400 mt-1">
            Manage your client relationships and history
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{displayClients.length}</p>
            <p className="text-sm text-gray-400">Total Clients</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#2A2D3A] border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-section-primary"
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredClients.map((client) => (
          <Link
            key={client.id}
            href={`/provider/clients/${client.id}`}
            className="bg-[#2A2D3A] rounded-xl border border-white/5 p-5 hover:border-section-primary/50 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {client.photoUrl ? (
                  <img
                    src={client.photoUrl}
                    alt={client.name}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-section-gradient flex items-center justify-center">
                    <span className="text-xl font-semibold text-white">
                      {client.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-white group-hover:text-section-primary transition-colors">
                    {client.name}
                  </h3>
                  <p className="text-sm text-gray-400">{client.email}</p>
                  {client.notes && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-500">Has notes</span>
                    </div>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-section-primary transition-colors" />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/5">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-white">{client.totalBookings}</p>
                <p className="text-xs text-gray-500">Bookings</p>
              </div>
              <div className="text-center border-x border-white/5">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-white">€{client.totalSpent}</p>
                <p className="text-xs text-gray-500">Total Spent</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-white">
                  {formatDate(client.lastVisit)}
                </p>
                <p className="text-xs text-gray-500">Last Visit</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No clients found</h3>
          <p className="text-gray-400">Try adjusting your search terms</p>
        </div>
      )}
    </div>
  );
}
