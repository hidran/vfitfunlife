"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import {
  Search,
  Filter,
  Calendar,
  X,
  Download,
  ChevronDown,
} from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
  dateRange?: {
    from: Date | null;
    to: Date | null;
    onChange: (from: Date | null, to: Date | null) => void;
  };
  onExport?: () => void;
  onClearFilters?: () => void;
  className?: string;
}

export function FilterBar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters = [],
  dateRange,
  onExport,
  onClearFilters,
  className,
}: FilterBarProps) {
  const { t } = useI18n();
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters =
    searchValue ||
    filters.some((f) => f.value && f.value !== "all") ||
    dateRange?.from ||
    dateRange?.to;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder={searchPlaceholder ?? 'Search...'}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#1E2230] border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#00C9FF]/50"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {filters.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2",
                showFilters && "bg-white/20"
              )}
            >
              <Filter className="w-4 h-4" />
              {t('admin.filter.filters')}
              {filters.some((f) => f.value && f.value !== "all") && (
                <span className="ml-1 w-5 h-5 rounded-full bg-[#00C9FF] text-white text-xs flex items-center justify-center">
                  {filters.filter((f) => f.value && f.value !== "all").length}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform",
                  showFilters && "rotate-180"
                )}
              />
            </Button>
          )}

          {onExport && (
            <Button variant="secondary" onClick={onExport} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              {t('admin.filter.export')}
            </Button>
          )}

          {hasActiveFilters && onClearFilters && (
            <Button variant="ghost" onClick={onClearFilters} className="text-white/60">
              {t('admin.filter.clear')}
            </Button>
          )}
        </div>
      </div>

      {/* Expandable Filters */}
      {showFilters && filters.length > 0 && (
        <div className="p-4 bg-[#1E2230] rounded-xl border border-white/10 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filters.map((filter) => (
              <div key={filter.key}>
                <label className="block text-sm text-white/50 mb-1.5">
                  {filter.label}
                </label>
                <select
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2D3A] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#00C9FF]/50"
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {dateRange && (
              <div className="sm:col-span-2">
                <label className="block text-sm text-white/50 mb-1.5">
                  {t('admin.filter.dateRange')}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="date"
                      value={dateRange.from ? dateRange.from.toISOString().split("T")[0] : ""}
                      onChange={(e) =>
                        dateRange.onChange(
                          e.target.value ? new Date(e.target.value) : null,
                          dateRange.to
                        )
                      }
                      className="w-full pl-9 pr-3 py-2 bg-[#2A2D3A] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#00C9FF]/50"
                    />
                  </div>
                  <span className="text-white/40">{t('admin.filter.dateTo')}</span>
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="date"
                      value={dateRange.to ? dateRange.to.toISOString().split("T")[0] : ""}
                      onChange={(e) =>
                        dateRange.onChange(
                          dateRange.from,
                          e.target.value ? new Date(e.target.value) : null
                        )
                      }
                      className="w-full pl-9 pr-3 py-2 bg-[#2A2D3A] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#00C9FF]/50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {searchValue && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#00C9FF]/20 text-[#00C9FF] text-xs rounded-full">
              {t('admin.filter.tagSearch', { value: searchValue })}
              <button
                onClick={() => onSearchChange("")}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.map(
            (filter) =>
              filter.value &&
              filter.value !== "all" && (
                <span
                  key={filter.key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/70 text-xs rounded-full"
                >
                  {filter.label}:{" "}
                  {filter.options.find((o) => o.value === filter.value)?.label}
                  <button
                    onClick={() => filter.onChange("all")}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
          )}
          {dateRange?.from && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/70 text-xs rounded-full">
              {t('admin.filter.tagFrom', { date: dateRange.from.toLocaleDateString() })}
              <button
                onClick={() => dateRange.onChange(null, dateRange.to)}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {dateRange?.to && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/70 text-xs rounded-full">
              {t('admin.filter.tagTo', { date: dateRange.to.toLocaleDateString() })}
              <button
                onClick={() => dateRange.onChange(dateRange.from, null)}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
