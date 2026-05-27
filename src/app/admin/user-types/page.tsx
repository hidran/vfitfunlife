"use client";

import { useState } from "react";
import { DataTable, FilterBar } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/admin/DataTable";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  Plus,
  Tag,
  Users,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
} from "lucide-react";

interface UserType {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  isActive: boolean;
  associatedProvidersCount: number;
  createdAt: Date;
}

export default function UserTypesPage() {
  const { t } = useI18n();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Mock data - would be fetched from store
  const userTypes: UserType[] = [
    {
      id: "1",
      name: "Personal Trainer",
      slug: "personal-trainer",
      description: "Fitness professionals who provide one-on-one training sessions",
      icon: "dumbbell",
      isActive: true,
      associatedProvidersCount: 45,
      createdAt: new Date("2024-01-15"),
    },
    {
      id: "2",
      name: "Yoga Instructor",
      slug: "yoga-instructor",
      description: "Certified yoga teachers for individual or group sessions",
      icon: "flower",
      isActive: true,
      associatedProvidersCount: 32,
      createdAt: new Date("2024-01-20"),
    },
    {
      id: "3",
      name: "Nutritionist",
      slug: "nutritionist",
      description: "Diet and nutrition experts for meal planning and consultation",
      icon: "apple",
      isActive: true,
      associatedProvidersCount: 18,
      createdAt: new Date("2024-02-01"),
    },
    {
      id: "4",
      name: "Massage Therapist",
      slug: "massage-therapist",
      description: "Licensed massage therapists for various massage types",
      icon: "hand",
      isActive: false,
      associatedProvidersCount: 0,
      createdAt: new Date("2024-02-15"),
    },
  ];

  const handleToggleActive = (id: string) => {
    console.log("Toggle active:", id);
  };

  const columns: Column<UserType>[] = [
    {
      key: "name",
      header: t('admin.userTypes.col.userType'),
      cell: (userType) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF]/20 to-[#7B61FF]/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-[#00C9FF]" />
          </div>
          <div>
            <p className="font-medium text-white">{userType.name}</p>
            <p className="text-xs text-white/50">{userType.slug}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "description",
      header: t('admin.userTypes.col.description'),
      cell: (userType) => (
        <p className="text-sm text-white/70 truncate max-w-xs">
          {userType.description}
        </p>
      ),
      width: "w-1/3",
    },
    {
      key: "providers",
      header: t('admin.userTypes.col.providers'),
      cell: (userType) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white">{userType.associatedProvidersCount}</span>
        </div>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: t('admin.userTypes.col.status'),
      cell: (userType) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(userType.id);
          }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            userType.isActive
              ? "bg-[#10B981]/20 text-[#10B981]"
              : "bg-white/10 text-white/50"
          }`}
        >
          {userType.isActive ? t('admin.userTypes.status.active') : t('admin.userTypes.status.inactive')}
        </button>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "created",
      header: t('admin.userTypes.col.created'),
      cell: (userType) => (
        <span className="text-sm text-white/50">
          {formatDate(userType.createdAt)}
        </span>
      ),
      sortable: true,
      width: "w-28",
    },
  ];

  const filteredUserTypes = userTypes.filter((ut) => {
    const matchesSearch =
      ut.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      ut.description.toLowerCase().includes(searchValue.toLowerCase());
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? ut.isActive
        : !ut.isActive;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.userTypes.title')}</h1>
          <p className="text-white/50 mt-1">
            {t('admin.userTypes.subtitle')}
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {/* TODO: Add user type modal */}}
        >
          <Plus className="w-4 h-4" />
          {t('admin.userTypes.addUserType')}
        </Button>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.userTypes.search')}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: "status",
            label: t('admin.userTypes.filter.status'),
            options: [
              { value: "all", label: t('admin.userTypes.filter.all') },
              { value: "active", label: t('admin.userTypes.filter.active') },
              { value: "inactive", label: t('admin.userTypes.filter.inactive') },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        onClearFilters={() => {
          setSearchValue("");
          setStatusFilter("all");
        }}
      />

      {/* Data Table */}
      <DataTable
        data={filteredUserTypes}
        columns={columns}
        keyExtractor={(userType) => userType.id}
        onRowClick={(userType) => {
          console.log("View user type:", userType.id);
        }}
        actions={{
          view: (userType) => console.log("View:", userType.id),
          edit: (userType) => console.log("Edit:", userType.id),
          delete: (userType) => console.log("Delete:", userType.id),
        }}
        emptyMessage={t('admin.userTypes.empty')}
      />
    </div>
  );
}
