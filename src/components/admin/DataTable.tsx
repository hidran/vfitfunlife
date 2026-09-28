"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";

/** What a column sorts by. null/undefined always sort last, whichever the direction. */
export type SortValue = string | number | boolean | Date | null | undefined;

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /**
   * The value this column sorts by. A column is sortable only when it has one: `key` is a
   * column id, not a row field ("joined", "status", "earnings" are computed in `cell`), so
   * sorting by `row[key]` compared `undefined` with `undefined` and never moved a row.
   */
  sortValue?: (row: T) => SortValue;
  /**
   * Legacy: sort by `row[key]`. Only correct when `key` really is a row field — prefer
   * `sortValue`, which wins when both are set.
   */
  sortable?: boolean;
  width?: string;
}

/** The accessor a column sorts by, or undefined when the column is not sortable. */
export function columnSortAccessor<T>(column: Column<T>): ((row: T) => SortValue) | undefined {
  if (column.sortValue) return column.sortValue;
  if (column.sortable) return (row: T) => (row as Record<string, unknown>)[column.key] as SortValue;
  return undefined;
}

function normalizeSortValue(value: SortValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  return value;
}

/** Sorts a copy of `rows` by `sortValue`; stable, nulls last in both directions. */
export function sortRows<T>(
  rows: T[],
  sortValue: (row: T) => SortValue,
  direction: "asc" | "desc"
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: normalizeSortValue(sortValue(row)) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      let cmp: number;
      if (typeof a.value === "number" && typeof b.value === "number") {
        cmp = a.value - b.value;
      } else {
        cmp = String(a.value).localeCompare(String(b.value), undefined, { sensitivity: "base" });
      }
      return cmp !== 0 ? cmp * factor : a.index - b.index;
    })
    .map((entry) => entry.row);
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
  };
  emptyMessage?: string;
  actions?: {
    view?: (row: T) => void;
    edit?: (row: T) => void;
    delete?: (row: T) => void;
  };
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  isLoading = false,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  pagination,
  emptyMessage,
  actions,
  className,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => {
        if (prev === "asc") return "desc";
        if (prev === "desc") return null;
        return "asc";
      });
      if (sortDirection === "desc") {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  // Sorts the rows currently loaded (this page); server-side sorting comes with pagination.
  const sortColumn = sortKey && sortDirection ? columns.find((c) => c.key === sortKey) : undefined;
  const sortAccessor = sortColumn ? columnSortAccessor(sortColumn) : undefined;
  const sortedData =
    sortAccessor && sortDirection ? sortRows(data, sortAccessor, sortDirection) : data;

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    
    if (selectedIds.length === data.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map((row) => keyExtractor(row)));
    }
  };

  const toggleSelect = (id: string) => {
    if (!onSelectionChange) return;
    
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < data.length;

  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-surface-2 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-surface rounded-2xl border border-hairline overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-hairline">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-content-muted hover:text-content transition-colors"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : isPartiallySelected ? (
                      <div className="w-5 h-5 border-2 border-white/40 rounded bg-[#00C9FF]/50" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
              )}
              {columns.map((column) => {
                const isSortable = columnSortAccessor(column) !== undefined;
                return (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider",
                    isSortable && "cursor-pointer select-none hover:text-content",
                    column.width
                  )}
                  aria-sort={
                    isSortable && sortKey === column.key && sortDirection
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  onClick={() => isSortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.header}
                    {isSortable && (
                      <span className="text-content-faint">
                        {sortKey === column.key ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
                );
              })}
              {actions && <th className="px-4 py-3 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="px-4 py-12 text-center text-content-faint"
                >
                  {emptyMessage ?? t('admin.table.empty')}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const rowId = keyExtractor(row);
                const isSelected = selectedIds.includes(rowId);

                return (
                  <tr
                    key={rowId}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-hairline last:border-0 transition-colors",
                      onRowClick && "cursor-pointer hover:bg-surface-2",
                      isSelected && "bg-[#00C9FF]/5"
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelect(rowId)}
                          className="text-content-muted hover:text-content transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-[#00C9FF]" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        {column.cell(row)}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenuOpen(
                                actionMenuOpen === rowId ? null : rowId
                              );
                            }}
                            className="p-1.5 rounded-lg text-content-faint hover:text-content hover:bg-surface-2 transition-colors"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {actionMenuOpen === rowId && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 w-36 bg-surface-elevated rounded-xl border border-hairline shadow-xl z-20 py-1">
                                {actions.view && (
                                  <button
                                    onClick={() => {
                                      actions.view?.(row);
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-surface-2 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                    {t('admin.table.actions.view')}
                                  </button>
                                )}
                                {actions.edit && (
                                  <button
                                    onClick={() => {
                                      actions.edit?.(row);
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-surface-2 transition-colors"
                                  >
                                    <Edit className="w-4 h-4" />
                                    {t('admin.table.actions.edit')}
                                  </button>
                                )}
                                {actions.delete && (
                                  <button
                                    onClick={() => {
                                      actions.delete?.(row);
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#EF4444] hover:bg-surface-2 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    {t('admin.table.actions.delete')}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-hairline flex items-center justify-between">
          <div className="text-sm text-content-muted">
            {t('admin.table.showing', {
              from: (pagination.currentPage - 1) * pagination.pageSize + 1,
              to: Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems),
              total: pagination.totalItems,
            })}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pagination.onPageChange(1)}
              disabled={pagination.currentPage === 1}
              className="text-content-muted hover:text-content disabled:opacity-30"
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="text-content-muted hover:text-content disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <span className="px-3 py-1 text-sm text-content">
              {pagination.currentPage} / {pagination.totalPages}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="text-content-muted hover:text-content disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.totalPages)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="text-content-muted hover:text-content disabled:opacity-30"
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
