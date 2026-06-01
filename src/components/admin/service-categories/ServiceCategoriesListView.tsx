'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { DataTable, FilterBar } from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Column } from '@/components/admin/DataTable';
import { formatDate, toDate } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { Spinner } from '@/components/ui/Spinner';
import { Plus } from 'lucide-react';

interface ServiceCategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
}

const SERVICE_CATEGORIES_COLLECTION = 'serviceCategories';

export function ServiceCategoriesListView() {
  const { t } = useI18n();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, SERVICE_CATEGORIES_COLLECTION), orderBy('order', 'asc')),
        );
        if (cancelled) return;
        const rows: ServiceCategoryRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: (data.name as string) ?? '',
            slug: (data.slug as string) ?? '',
            icon: (data.icon as string) ?? '',
            isActive: (data.isActive as boolean) ?? false,
            order: (data.order as number) ?? 0,
            createdAt:
              toDate(
                data.createdAt as
                  | Date
                  | { toDate: () => Date }
                  | string
                  | number
                  | null
                  | undefined,
              ) ?? new Date(),
          };
        });
        setServiceCategories(rows);
      } catch (err) {
        console.error('Failed to load service categories', err);
        if (!cancelled) setServiceCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<ServiceCategoryRow>[] = [
    {
      key: 'name',
      header: t('admin.serviceCategories.col.name'),
      cell: (sc) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF]/20 to-[#7B61FF]/20 flex items-center justify-center text-lg">
            {sc.icon}
          </div>
          <div>
            <p className="font-medium text-content">{`${sc.icon} ${sc.name}`}</p>
            <p className="text-xs text-content-muted">{sc.slug}</p>
          </div>
        </div>
      ),
      width: 'w-1/3',
    },
    {
      key: 'order',
      header: t('admin.serviceCategories.col.order'),
      cell: (sc) => <span className="text-sm text-content-muted">{sc.order}</span>,
      sortable: true,
      width: 'w-24',
    },
    {
      key: 'status',
      header: t('admin.serviceCategories.col.status'),
      cell: (sc) => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            sc.isActive
              ? 'bg-[#10B981]/20 text-[#10B981]'
              : 'bg-surface-2 text-content-muted'
          }`}
        >
          {sc.isActive
            ? t('admin.serviceCategories.status.active')
            : t('admin.serviceCategories.status.inactive')}
        </span>
      ),
      sortable: true,
      width: 'w-24',
    },
    {
      key: 'created',
      header: t('admin.serviceCategories.col.created'),
      cell: (sc) => (
        <span className="text-sm text-content-muted">{formatDate(sc.createdAt)}</span>
      ),
      sortable: true,
      width: 'w-28',
    },
  ];

  const filtered = serviceCategories.filter((sc) => {
    const matchesSearch = sc.name.toLowerCase().includes(searchValue.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? sc.isActive
        : !sc.isActive;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">
            {t('admin.serviceCategories.title')}
          </h1>
          <p className="text-content-muted mt-1">{t('admin.serviceCategories.subtitle')}</p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => router.push('/admin/services/?id=new')}
        >
          <Plus className="w-4 h-4" />
          {t('admin.serviceCategories.addServiceCategory')}
        </Button>
      </div>

      <FilterBar
        searchPlaceholder={t('admin.serviceCategories.search')}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: 'status',
            label: t('admin.serviceCategories.filter.status'),
            options: [
              { value: 'all', label: t('admin.serviceCategories.filter.all') },
              { value: 'active', label: t('admin.serviceCategories.filter.active') },
              { value: 'inactive', label: t('admin.serviceCategories.filter.inactive') },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        onClearFilters={() => {
          setSearchValue('');
          setStatusFilter('all');
        }}
      />

      {loading ? (
        <div className="flex justify-center p-8">
          <Spinner size="md" />
        </div>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          keyExtractor={(sc) => sc.id}
          onRowClick={(sc) => router.push(`/admin/services/?id=${sc.id}`)}
          emptyMessage={t('admin.serviceCategories.empty')}
        />
      )}
    </div>
  );
}
