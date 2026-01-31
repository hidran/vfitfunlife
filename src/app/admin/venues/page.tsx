"use client";

import { useState } from "react";
import { DataTable, FilterBar, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/admin/DataTable";
import { formatDate } from "@/lib/utils";
import {
  Plus,
  MapPin,
  Star,
  Store,
  Phone,
} from "lucide-react";

interface Venue {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  phone: string;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isPartner: boolean;
  createdAt: Date;
}

export default function VenuesPage() {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Mock data
  const venues: Venue[] = [
    {
      id: "1",
      name: "Fitness Hub Milano",
      type: "gym",
      address: "Via Roma 123",
      city: "Milano",
      phone: "+39 02 1234567",
      rating: 4.8,
      reviewCount: 124,
      isActive: true,
      isPartner: true,
      createdAt: new Date("2024-01-15"),
    },
    {
      id: "2",
      name: "Zen Wellness Center",
      type: "wellness_center",
      address: "Corso Buenos Aires 456",
      city: "Milano",
      phone: "+39 02 7654321",
      rating: 4.5,
      reviewCount: 89,
      isActive: true,
      isPartner: true,
      createdAt: new Date("2024-02-01"),
    },
    {
      id: "3",
      name: "Beauty Spa Roma",
      type: "beauty_salon",
      address: "Via del Corso 789",
      city: "Roma",
      phone: "+39 06 1234567",
      rating: 4.2,
      reviewCount: 56,
      isActive: false,
      isPartner: false,
      createdAt: new Date("2024-02-15"),
    },
  ];

  const columns: Column<Venue>[] = [
    {
      key: "name",
      header: "Venue",
      cell: (venue) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF]/20 to-[#7B61FF]/20 flex items-center justify-center">
            <Store className="w-5 h-5 text-[#00C9FF]" />
          </div>
          <div>
            <p className="font-medium text-white">{venue.name}</p>
            <p className="text-xs text-white/50 capitalize">{venue.type.replace("_", " ")}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "location",
      header: "Location",
      cell: (venue) => (
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-white">{venue.address}</p>
            <p className="text-xs text-white/50">{venue.city}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "contact",
      header: "Contact",
      cell: (venue) => (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/70">{venue.phone}</span>
        </div>
      ),
      width: "w-32",
    },
    {
      key: "rating",
      header: "Rating",
      cell: (venue) => (
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />
          <span className="text-sm text-white">{venue.rating}</span>
          <span className="text-xs text-white/40">({venue.reviewCount})</span>
        </div>
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "partner",
      header: "Partner",
      cell: (venue) => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            venue.isPartner
              ? "bg-[#7B61FF]/20 text-[#7B61FF]"
              : "bg-white/10 text-white/50"
          }`}
        >
          {venue.isPartner ? "Partner" : "Standard"}
        </span>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: "Status",
      cell: (venue) => (
        <StatusBadge status={venue.isActive ? "active" : "suspended"} size="sm" />
      ),
      sortable: true,
      width: "w-24",
    },
  ];

  const filteredVenues = venues.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      v.city.toLowerCase().includes(searchValue.toLowerCase());
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? v.isActive
        : !v.isActive;
    const matchesType = typeFilter === "all" ? true : v.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Venues</h1>
          <p className="text-white/50 mt-1">Manage partner venues and locations</p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {/* TODO: Add venue modal */}}
        >
          <Plus className="w-4 h-4" />
          Add Venue
        </Button>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder="Search venues by name or city..."
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: "type",
            label: "Type",
            options: [
              { value: "all", label: "All Types" },
              { value: "gym", label: "Gym" },
              { value: "wellness_center", label: "Wellness Center" },
              { value: "beauty_salon", label: "Beauty Salon" },
              { value: "outdoor_space", label: "Outdoor Space" },
              { value: "event_space", label: "Event Space" },
            ],
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        onClearFilters={() => {
          setSearchValue("");
          setStatusFilter("all");
          setTypeFilter("all");
        }}
      />

      {/* Data Table */}
      <DataTable
        data={filteredVenues}
        columns={columns}
        keyExtractor={(venue) => venue.id}
        onRowClick={(venue) => {
          console.log("View venue:", venue.id);
        }}
        actions={{
          view: (venue) => console.log("View:", venue.id),
          edit: (venue) => console.log("Edit:", venue.id),
          delete: (venue) => console.log("Delete:", venue.id),
        }}
        emptyMessage="No venues found"
      />
    </div>
  );
}
