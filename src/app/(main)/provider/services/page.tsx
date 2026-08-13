'use client';

import { useState } from 'react';
import { Plus, Edit, Copy, Trash2, MoreVertical, Check, X, Clock, DollarSign, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { useServiceCategoryGroups, useServiceCategoryMap } from '@/hooks/useServiceCategories';
import {
  useProvider,
  useProviderServices,
  useCreateProviderService,
  useUpdateProviderService,
  useDeleteProviderService,
} from '@/hooks/useProviders';
import { useUpdateProviderPhotos } from '@/hooks/usePhotoUpload';
import { PhotoUploader } from '@/components/gallery/PhotoUploader';
import type { InstructorService } from '@/types/instructor';
import type { ProviderServiceInput } from '@/lib/firebase/providers';

const EMPTY_DRAFT: ProviderServiceInput = {
  name: '',
  description: '',
  price: 0,
  durationMinutes: 60,
  isActive: true,
  // No default category on purpose: a silent default is how a catalogue ends up with
  // every service tagged 'Personal Training'.
  categoryId: '',
};

export default function ProviderServicesPage() {
  const { t } = useI18n();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const uid = firebaseUser?.uid;

  const [activeTab, setActiveTab] = useState<'services' | 'gallery'>('services');
  const { data: provider } = useProvider(uid);
  const updatePhotos = useUpdateProviderPhotos(uid);
  const photos = provider?.photoUrls ?? [];

  const categoryGroups = useServiceCategoryGroups();
  const categoryMap = useServiceCategoryMap();
  const { data: services = [], isLoading } = useProviderServices(uid);
  const createService = useCreateProviderService(uid);
  const updateService = useUpdateProviderService(uid);
  const deleteService = useDeleteProviderService(uid);

  const [editingService, setEditingService] = useState<InstructorService | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [draft, setDraft] = useState<ProviderServiceInput>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  // One shared busy flag: the whole card grid is driven by a single query, so any in-flight
  // mutation makes every row's state provisional until it settles.
  const isBusy = createService.isPending || updateService.isPending || deleteService.isPending;

  /**
   * Mutations are awaited rather than fired: the old page's handlers were synchronous and
   * that is precisely why nothing persisted. A rejection has to reach the user, because the
   * list re-renders from the server and would otherwise just silently snap back.
   */
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      console.error('[provider/services]', err);
      setError(t('provider.services.error.save'));
      return false;
    }
  };

  const handleToggleActive = (service: InstructorService) =>
    void run(() =>
      updateService.mutateAsync({
        serviceId: service.id,
        data: { isActive: !service.isActive },
      })
    );

  const handleDuplicate = (service: InstructorService) =>
    void run(() =>
      createService.mutateAsync({
        name: t('provider.services.duplicate.name', { name: service.name }),
        description: service.description ?? '',
        price: service.price,
        durationMinutes: service.durationMinutes,
        categoryId: service.categoryId,
        isActive: false, // a copy is a draft until the trainer says otherwise
      })
    );

  const handleDelete = (serviceId: string) => {
    if (!confirm(t('provider.services.confirm.delete'))) return;
    void run(() => deleteService.mutateAsync(serviceId));
  };

  const handleSaveEdit = async () => {
    if (!editingService) return;
    const ok = await run(() =>
      updateService.mutateAsync({
        serviceId: editingService.id,
        data: {
          name: editingService.name,
          description: editingService.description ?? '',
          price: editingService.price,
          durationMinutes: editingService.durationMinutes,
          isActive: editingService.isActive,
          categoryId: editingService.categoryId,
        },
      })
    );
    if (ok) setEditingService(null);
  };

  const handleAddService = async () => {
    const ok = await run(() =>
      createService.mutateAsync({
        ...draft,
        name: draft.name.trim(),
        price: Number.isFinite(draft.price) ? draft.price : 0,
        durationMinutes: Number.isFinite(draft.durationMinutes) ? draft.durationMinutes : 60,
      })
    );
    if (ok) {
      setShowAddModal(false);
      setDraft(EMPTY_DRAFT);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('provider.services.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('provider.services.subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={!uid}>
          <Plus className="w-4 h-4 mr-2" />
          {t('provider.services.btn.addService')}
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="mb-4 flex gap-2 border-b border-hairline">
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium',
            activeTab === 'services'
              ? 'border-section-primary text-text-inverse'
              : 'border-transparent text-text-secondary'
          )}
        >
          {t('provider.services.tab.services')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gallery')}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium',
            activeTab === 'gallery'
              ? 'border-section-primary text-text-inverse'
              : 'border-transparent text-text-secondary'
          )}
        >
          {t('provider.services.tab.gallery')}
        </button>
      </div>

      {activeTab === 'gallery' && (
        <div>
          {!uid ? (
            <p className="text-sm text-text-secondary">{t('provider.services.gallery.loginHint')}</p>
          ) : (
            <PhotoUploader
              scope="instructors"
              entityId={uid}
              photos={photos}
              onChange={(newPhotos) => updatePhotos.mutate(newPhotos)}
              disabled={updatePhotos.isPending}
            />
          )}
        </div>
      )}

      {activeTab === 'services' && <>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-text-secondary">{t('common.loading')}</p>
      ) : services.length === 0 ? (
        /* The state the reporting trainer was stuck in: a bare grid gave no hint that
           adding a service was even possible. */
        <div className="rounded-xl border border-hairline bg-surface-elevated p-8 text-center">
          <Briefcase className="w-10 h-10 mx-auto text-gray-500 mb-3" />
          <h3 className="font-semibold text-content">{t('provider.services.empty.title')}</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">{t('provider.services.empty.body')}</p>
          <Button onClick={() => setShowAddModal(true)} disabled={!uid}>
            <Plus className="w-4 h-4 mr-2" />
            {t('provider.services.btn.addService')}
          </Button>
        </div>
      ) : (
      /* Services Grid */
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services.map((service) => (
          <div
            key={service.id}
            className={cn(
              'bg-surface-elevated rounded-xl border p-5 transition-all',
              service.isActive ? 'border-hairline' : 'border-hairline opacity-70',
              isBusy && 'pointer-events-none opacity-60'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-content">{service.name}</h3>
                  {!service.isActive && (
                    <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                      {t('provider.services.card.inactive')}
                    </span>
                  )}
                </div>
                {service.categoryId && categoryMap.get(service.categoryId) && (
                  <p className="text-sm text-gray-400 mt-1">
                    {categoryMap.get(service.categoryId)!.icon}{' '}
                    {categoryMap.get(service.categoryId)!.name}
                  </p>
                )}
              </div>
              <div className="relative group">
                <button className="p-2 rounded-lg hover:bg-surface-2">
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-surface-input rounded-lg border border-hairline shadow-xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-10 py-1">
                  <button
                    onClick={() => setEditingService(service)}
                    className="w-full px-4 py-2 text-left text-sm text-content hover:bg-surface-2 flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    {t('provider.services.menu.edit')}
                  </button>
                  <button
                    onClick={() => handleDuplicate(service)}
                    className="w-full px-4 py-2 text-left text-sm text-content hover:bg-surface-2 flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {t('provider.services.menu.duplicate')}
                  </button>
                  <button
                    onClick={() => handleToggleActive(service)}
                    className="w-full px-4 py-2 text-left text-sm text-content hover:bg-surface-2 flex items-center gap-2"
                  >
                    {service.isActive ? (
                      <><X className="w-4 h-4" /> {t('provider.services.menu.deactivate')}</>
                    ) : (
                      <><Check className="w-4 h-4" /> {t('provider.services.menu.activate')}</>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('provider.services.menu.delete')}
                  </button>
                </div>
              </div>
            </div>

            {service.description && (
              <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                {service.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-input rounded-lg p-3">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                  <DollarSign className="w-3 h-3" />
                  {t('provider.services.card.price')}
                </div>
                <p className="text-lg font-semibold text-content">€{service.price}</p>
              </div>
              <div className="bg-surface-input rounded-lg p-3">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                  <Clock className="w-3 h-3" />
                  {t('provider.services.card.duration')}
                </div>
                <p className="text-lg font-semibold text-content">{service.durationMinutes} min</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Edit Modal */}
      {editingService && (
        <Modal onClose={() => setEditingService(null)}>
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-content mb-6">{t('provider.services.edit.title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.serviceName')}</label>
                <input
                  type="text"
                  value={editingService.name}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.description')}</label>
                <textarea
                  value={editingService.description ?? ''}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.category')}</label>
                <select
                  value={editingService.categoryId ?? ''}
                  onChange={(e) => setEditingService({ ...editingService, categoryId: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                >
                  <option value="">{t('provider.services.edit.categoryPlaceholder')}</option>
                  {categoryGroups.map(({ group, leaves }) => (
                    <optgroup key={group.id} label={`${group.icon} ${group.name}`}>
                      {leaves.map((leaf) => (
                        <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.price')}</label>
                  <input
                    type="number"
                    value={editingService.price}
                    onChange={(e) => setEditingService({ ...editingService, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.duration')}</label>
                  <input
                    type="number"
                    value={editingService.durationMinutes}
                    onChange={(e) => setEditingService({ ...editingService, durationMinutes: parseInt(e.target.value) || 0 })}
                    className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editingService.isActive}
                  onChange={(e) => setEditingService({ ...editingService, isActive: e.target.checked })}
                  className="w-5 h-5 rounded border-white/20 bg-transparent text-section-primary focus:ring-section-primary"
                />
                <label htmlFor="isActive" className="text-content">{t('provider.services.edit.isActive')}</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleSaveEdit}
                isLoading={updateService.isPending}
                disabled={!editingService.name.trim() || !editingService.categoryId}
                fullWidth
              >
                {t('provider.services.edit.save')}
              </Button>
              <Button variant="secondary" onClick={() => setEditingService(null)}>
                {t('provider.services.edit.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-content mb-6">{t('provider.services.add.title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.serviceName')}</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  placeholder={t('provider.services.add.serviceNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.description')}</label>
                <textarea
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary min-h-[80px]"
                  placeholder={t('provider.services.add.descriptionPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.category')}</label>
                <select
                  value={draft.categoryId ?? ''}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                  className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                >
                  <option value="">{t('provider.services.edit.categoryPlaceholder')}</option>
                  {categoryGroups.map(({ group, leaves }) => (
                    <optgroup key={group.id} label={`${group.icon} ${group.name}`}>
                      {leaves.map((leaf) => (
                        <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.price')}</label>
                  <input
                    type="number"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.duration')}</label>
                  <select
                    value={draft.durationMinutes}
                    onChange={(e) => setDraft({ ...draft, durationMinutes: parseInt(e.target.value) })}
                    className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleAddService}
                isLoading={createService.isPending}
                disabled={!draft.name.trim() || !draft.categoryId}
                fullWidth
              >
                {t('provider.services.add.submit')}
              </Button>
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                {t('provider.services.add.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      </>}
    </div>
  );
}
