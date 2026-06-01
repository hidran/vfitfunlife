'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { DataTable, FilterBar, SuperadminOnly } from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Column } from '@/components/admin/DataTable';
import { formatDate, toDate } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { Spinner } from '@/components/ui/Spinner';
import { Plus, Tag } from 'lucide-react';

interface UserTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  isActive: boolean;
  createdAt: Date;
}

const USER_TYPES_COLLECTION = 'userTypes';

export function UserTypesListView() {
  const { t } = useI18n();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userTypes, setUserTypes] = useState<UserTypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, USER_TYPES_COLLECTION), orderBy('name', 'asc')),
        );
        if (cancelled) return;
        const rows: UserTypeRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: (data.name as string) ?? '',
            slug: (data.slug as string) ?? '',
            description: (data.description as string) ?? '',
            icon: (data.icon as string) ?? '',
            isActive: (data.isActive as boolean) ?? false,
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
        setUserTypes(rows);
      } catch (err) {
        console.error('Failed to load user types', err);
        if (!cancelled) setUserTypes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<UserTypeRow>[] = [
    {
      key: 'name',
      header: t('admin.userTypes.col.userType'),
      cell: (ut) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF]/20 to-[#7B61FF]/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-[#00C9FF]" />
          </div>
          <div>
            <p className="font-medium text-content">{ut.name}</p>
            <p className="text-xs text-content-muted">{ut.slug}</p>
          </div>
        </div>
      ),
      width: 'w-1/4',
    },
    {
      key: 'description',
      header: t('admin.userTypes.col.description'),
      cell: (ut) => (
        <p className="text-sm text-content-muted truncate max-w-xs">{ut.description}</p>
      ),
      width: 'w-1/3',
    },
    {
      key: 'status',
      header: t('admin.userTypes.col.status'),
      cell: (ut) => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            ut.isActive
              ? 'bg-[#10B981]/20 text-[#10B981]'
              : 'bg-surface-2 text-content-muted'
          }`}
        >
          {ut.isActive
            ? t('admin.userTypes.status.active')
            : t('admin.userTypes.status.inactive')}
        </span>
      ),
      sortable: true,
      width: 'w-24',
    },
    {
      key: 'created',
      header: t('admin.userTypes.col.created'),
      cell: (ut) => (
        <span className="text-sm text-content-muted">{formatDate(ut.createdAt)}</span>
      ),
      sortable: true,
      width: 'w-28',
    },
  ];

  const filtered = userTypes.filter((ut) => {
    const matchesSearch =
      ut.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      ut.description.toLowerCase().includes(searchValue.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? ut.isActive
        : !ut.isActive;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">
            {t('admin.userTypes.title')}
          </h1>
          <p className="text-content-muted mt-1">{t('admin.userTypes.subtitle')}</p>
        </div>
        <SuperadminOnly>
          <Button
            variant="primary"
            className="flex items-center gap-2"
            onClick={() => router.push('/admin/user-types/?id=new')}
          >
            <Plus className="w-4 h-4" />
            {t('admin.userTypes.addUserType')}
          </Button>
        </SuperadminOnly>
      </div>

      <FilterBar
        searchPlaceholder={t('admin.userTypes.search')}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: 'status',
            label: t('admin.userTypes.filter.status'),
            options: [
              { value: 'all', label: t('admin.userTypes.filter.all') },
              { value: 'active', label: t('admin.userTypes.filter.active') },
              { value: 'inactive', label: t('admin.userTypes.filter.inactive') },
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
          keyExtractor={(ut) => ut.id}
          onRowClick={(ut) => router.push(`/admin/user-types/?id=${ut.id}`)}
          emptyMessage={t('admin.userTypes.empty')}
        />
      )}
    </div>
  );
}
