'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Copy, Trash2, MoreVertical, Check, X, Clock, DollarSign, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { ProviderService } from '@/types/provider';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { fetchProviderServices } from '@/lib/firebase/providers';
import { useProvider } from '@/hooks/useProviders';
import { useUpdateProviderPhotos } from '@/hooks/usePhotoUpload';
import { PhotoUploader } from '@/components/gallery/PhotoUploader';

export default function ProviderServicesPage() {
  const { t } = useI18n();
  const { services, isLoadingServices, fetchServices, updateService, deleteService } = useProviderStore();
  const [displayServices, setDisplayServices] = useState<ProviderService[]>([]);
  const nextServiceIdRef = useRef(1);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const [activeTab, setActiveTab] = useState<'services' | 'gallery'>('services');
  const uid = firebaseUser?.uid;
  const { data: provider } = useProvider(uid);
  const updatePhotos = useUpdateProviderPhotos(uid);
  const photos = provider?.photoUrls ?? [];

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    void fetchProviderServices(firebaseUser.uid).then((firestoreServices) => {
      setDisplayServices(firestoreServices as unknown as ProviderService[]);
      nextServiceIdRef.current = firestoreServices.length + 1;
    });
  }, [firebaseUser?.uid]);
  const [editingService, setEditingService] = useState<ProviderService | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newService, setNewService] = useState<Partial<ProviderService>>({
    serviceName: '',
    description: '',
    price: 0,
    durationMinutes: 60,
    isActive: true,
  });

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const createServiceId = () => {
    const id = `new-${nextServiceIdRef.current}`;
    nextServiceIdRef.current += 1;
    return id;
  };

  const handleToggleActive = (service: ProviderService) => {
    const updated = displayServices.map(s =>
      s.id === service.id ? { ...s, isActive: !s.isActive } : s
    );
    setDisplayServices(updated);
  };

  const handleDuplicate = (service: ProviderService) => {
    const duplicate: ProviderService = {
      ...service,
      id: createServiceId(),
      serviceName: `${service.serviceName} (Copy)`,
      bookingCount: 0,
      revenue: 0,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };
    setDisplayServices([...displayServices, duplicate]);
  };

  const handleDelete = (serviceId: string) => {
    if (confirm(t('provider.services.confirm.delete'))) {
      setDisplayServices(displayServices.filter(s => s.id !== serviceId));
    }
  };

  const handleSaveEdit = () => {
    if (editingService) {
      const updated = displayServices.map(s =>
        s.id === editingService.id ? editingService : s
      );
      setDisplayServices(updated);
      setEditingService(null);
    }
  };

  const handleAddService = () => {
    const service: ProviderService = {
      id: createServiceId(),
      serviceName: newService.serviceName || 'New Service',
      description: newService.description || '',
      price: newService.price || 0,
      durationMinutes: newService.durationMinutes || 60,
      isActive: true,
      categoryId: 'fitness',
      categoryName: 'Fitness',
      bookingCount: 0,
      revenue: 0,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };
    setDisplayServices([...displayServices, service]);
    setShowAddModal(false);
    setNewService({
      serviceName: '',
      description: '',
      price: 0,
      durationMinutes: 60,
      isActive: true,
    });
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
        <Button onClick={() => setShowAddModal(true)}>
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

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayServices.map((service) => (
          <div
            key={service.id}
            className={cn(
              'bg-[#2A2D3A] rounded-xl border p-5 transition-all',
              service.isActive ? 'border-hairline' : 'border-hairline opacity-70'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-content">{service.serviceName}</h3>
                  {!service.isActive && (
                    <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                      {t('provider.services.card.inactive')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1">{service.categoryName}</p>
              </div>
              <div className="relative group">
                <button className="p-2 rounded-lg hover:bg-surface-2">
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-[#1A1D29] rounded-lg border border-hairline shadow-xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-10 py-1">
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
                  {service.bookingCount === 0 && (
                    <button
                      onClick={() => handleDelete(service.id)}
                      className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('provider.services.menu.delete')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-4 line-clamp-2">
              {service.description}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-[#1A1D29] rounded-lg p-3">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                  <DollarSign className="w-3 h-3" />
                  {t('provider.services.card.price')}
                </div>
                <p className="text-lg font-semibold text-content">€{service.price}</p>
              </div>
              <div className="bg-[#1A1D29] rounded-lg p-3">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                  <Clock className="w-3 h-3" />
                  {t('provider.services.card.duration')}
                </div>
                <p className="text-lg font-semibold text-content">{service.durationMinutes} min</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-400 pt-4 border-t border-hairline">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {t('provider.services.card.bookings', { count: service.bookingCount })}
              </div>
              <div>
                {t('provider.services.card.earned', { amount: `€${service.revenue}` })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingService && (
        <Modal onClose={() => setEditingService(null)}>
          <div className="bg-[#2A2D3A] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-content mb-6">{t('provider.services.edit.title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.serviceName')}</label>
                <input
                  type="text"
                  value={editingService.serviceName}
                  onChange={(e) => setEditingService({ ...editingService, serviceName: e.target.value })}
                  className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.description')}</label>
                <textarea
                  value={editingService.description}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.price')}</label>
                  <input
                    type="number"
                    value={editingService.price}
                    onChange={(e) => setEditingService({ ...editingService, price: parseFloat(e.target.value) })}
                    className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.duration')}</label>
                  <input
                    type="number"
                    value={editingService.durationMinutes}
                    onChange={(e) => setEditingService({ ...editingService, durationMinutes: parseInt(e.target.value) })}
                    className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
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
              <Button onClick={handleSaveEdit} fullWidth>
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
          <div className="bg-[#2A2D3A] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-content mb-6">{t('provider.services.add.title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.serviceName')}</label>
                <input
                  type="text"
                  value={newService.serviceName}
                  onChange={(e) => setNewService({ ...newService, serviceName: e.target.value })}
                  className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                  placeholder={t('provider.services.add.serviceNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.description')}</label>
                <textarea
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary min-h-[80px]"
                  placeholder={t('provider.services.add.descriptionPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.price')}</label>
                  <input
                    type="number"
                    value={newService.price}
                    onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                    className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('provider.services.edit.duration')}</label>
                  <select
                    value={newService.durationMinutes}
                    onChange={(e) => setNewService({ ...newService, durationMinutes: parseInt(e.target.value) })}
                    className="w-full bg-[#1A1D29] border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
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
                disabled={!newService.serviceName}
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
