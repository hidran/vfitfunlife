"use client";

// KNOWN ISSUE (2026-05-28): hydrating this page throws
// `useI18nContext must be used within I18nProvider` from inside Button (used by
// DataTable). Other admin pages with the same Button/DataTable usage work fine.
// Bisection narrowed it to the `columns` prop with realistic cell closures, but
// the underlying cause (likely a bundler-level Context-identity issue) hasn't
// been pinned down. Disable in nav or open at your own risk until fixed.

import { useState } from "react";
import { DataTable, FilterBar, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/admin/DataTable";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  Plus,
  MapPin,
  Star,
  Store,
  Phone,
  Camera,
} from "lucide-react";
import { PhotoUploader } from "@/components/gallery/PhotoUploader";
import { PhotoEditorOverlay } from "@/components/gallery/PhotoEditorOverlay";
import { useUpdateVenuePhotos } from "@/hooks/usePhotoUpload";
import { useVenues } from "@/hooks/useVenues";
import { Spinner } from "@/components/ui/Spinner";

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
  photoUrls?: string[];
}

export default function VenuesPage() {
  const { t } = useI18n();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingVenue, setEditingVenue] = useState<{ id: string; name: string; photoUrls: string[] } | null>(null);
  const updateVenuePhotosM = useUpdateVenuePhotos(editingVenue?.id);

  const { data: firestoreVenues = [], isLoading } = useVenues({});

  const venues: Venue[] = firestoreVenues.map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    address: v.address,
    city: v.city,
    phone: '',
    rating: v.rating,
    reviewCount: v.reviewCount,
    isActive: v.isActive,
    isPartner: v.isPartner,
    createdAt: v.createdAt?.toDate?.() ?? new Date(),
    photoUrls: v.photoUrls ?? [],
  }));

  const columns: Column<Venue>[] = [
    {
      key: "name",
      header: t('admin.venues.col.venue'),
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
      header: t('admin.venues.col.location'),
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
      header: t('admin.venues.col.contact'),
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
      header: t('admin.venues.col.rating'),
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
      header: t('admin.venues.col.partner'),
      cell: (venue) => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            venue.isPartner
              ? "bg-[#7B61FF]/20 text-[#7B61FF]"
              : "bg-white/10 text-white/50"
          }`}
        >
          {venue.isPartner ? t('admin.venues.partner.partner') : t('admin.venues.partner.standard')}
        </span>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: t('admin.venues.col.status'),
      cell: (venue) => (
        <StatusBadge status={venue.isActive ? "active" : "suspended"} size="sm" />
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "photos",
      header: t('admin.venues.col.photos'),
      cell: (venue) => (
        <button
          type="button"
          onClick={() =>
            setEditingVenue({
              id: venue.id,
              name: venue.name,
              photoUrls: venue.photoUrls ?? [],
            })
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label={t('admin.venues.col.editPhotosAria')}
        >
          <Camera className="h-4 w-4" />
        </button>
      ),
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
          <h1 className="text-2xl font-bold text-white">{t('admin.venues.title')}</h1>
          <p className="text-white/50 mt-1">{t('admin.venues.subtitle')}</p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {/* TODO: Add venue modal */}}
        >
          <Plus className="w-4 h-4" />
          {t('admin.venues.addVenue')}
        </Button>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.venues.search')}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: "type",
            label: t('admin.venues.filter.type'),
            options: [
              { value: "all", label: t('admin.venues.filter.allTypes') },
              { value: "gym", label: t('admin.venues.filter.gym') },
              { value: "wellness_center", label: t('admin.venues.filter.wellnessCenter') },
              { value: "beauty_salon", label: t('admin.venues.filter.beautySalon') },
              { value: "outdoor_space", label: t('admin.venues.filter.outdoorSpace') },
              { value: "event_space", label: t('admin.venues.filter.eventSpace') },
            ],
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            key: "status",
            label: t('admin.venues.filter.status'),
            options: [
              { value: "all", label: t('admin.venues.filter.allStatus') },
              { value: "active", label: t('admin.venues.filter.active') },
              { value: "suspended", label: t('admin.venues.filter.suspended') },
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
      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner size="md" /></div>
      ) : (
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
          emptyMessage={t('admin.venues.empty')}
        />
      )}

      {editingVenue && (
        <PhotoEditorOverlay
          title={`Foto — ${editingVenue.name}`}
          onClose={() => setEditingVenue(null)}
        >
          <PhotoUploader
            scope="venues"
            entityId={editingVenue.id}
            photos={editingVenue.photoUrls}
            onChange={(newPhotos) => {
              setEditingVenue({ ...editingVenue, photoUrls: newPhotos });
              updateVenuePhotosM.mutate(newPhotos);
            }}
            disabled={updateVenuePhotosM.isPending}
          />
        </PhotoEditorOverlay>
      )}
    </div>
  );
}
