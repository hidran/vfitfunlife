'use client';

import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, DollarSign, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ServicePricing } from '@/types/firebase';
import { formatPrice } from '@/lib/utils';

interface ServicePricingCardProps {
  services: ServicePricing[];
  onAdd?: (service: Omit<ServicePricing, 'id'>) => void;
  onUpdate?: (id: string, service: Omit<ServicePricing, 'id'>) => void;
  onDelete?: (id: string) => void;
  isEditable?: boolean;
  className?: string;
}

const defaultService: Omit<ServicePricing, 'id'> = {
  serviceName: '',
  description: '',
  price: 0,
  durationMinutes: 60,
  isActive: true,
};

export function ServicePricingCard({
  services,
  onAdd,
  onUpdate,
  onDelete,
  isEditable = true,
  className,
}: ServicePricingCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newService, setNewService] = useState(defaultService);
  const [editService, setEditService] = useState<Omit<ServicePricing, 'id'>>(defaultService);

  const handleAdd = () => {
    if (!newService.serviceName.trim() || newService.price <= 0) return;
    onAdd?.(newService);
    setNewService(defaultService);
    setIsAdding(false);
  };

  const handleUpdate = () => {
    if (!editingId || !editService.serviceName.trim() || editService.price <= 0) return;
    onUpdate?.(editingId, editService);
    setEditingId(null);
  };

  const handleEdit = (service: ServicePricing) => {
    setEditingId(service.id);
    setEditService({
      serviceName: service.serviceName,
      description: service.description,
      price: service.price,
      durationMinutes: service.durationMinutes,
      isActive: service.isActive,
    });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setNewService(defaultService);
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} hr`;
    return `${hours} hr ${remainingMinutes} min`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">
          Services & Pricing ({services.length})
        </h3>
        {isEditable && !isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={16} className="mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Services List */}
      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.id}
            className={cn(
              'p-4 rounded-xl border transition-all',
              service.isActive
                ? 'bg-background-secondary/5 border-white/5'
                : 'bg-background-secondary/5 border-white/5 opacity-60'
            )}
          >
            {editingId === service.id ? (
              // Edit Mode
              <div className="space-y-3">
                <Input
                  label="Service Name"
                  value={editService.serviceName}
                  onChange={(e) => setEditService({ ...editService, serviceName: e.target.value })}
                  placeholder="e.g., Personal Training Session"
                />
                <Input
                  label="Description"
                  value={editService.description}
                  onChange={(e) => setEditService({ ...editService, description: e.target.value })}
                  placeholder="Brief description of the service"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Price (€)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editService.price}
                    onChange={(e) => setEditService({ ...editService, price: parseFloat(e.target.value) || 0 })}
                    leftIcon={<DollarSign size={16} />}
                  />
                  <Input
                    label="Duration (minutes)"
                    type="number"
                    min="15"
                    step="15"
                    value={editService.durationMinutes}
                    onChange={(e) => setEditService({ ...editService, durationMinutes: parseInt(e.target.value) || 60 })}
                    leftIcon={<Clock size={16} />}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`edit-active-${service.id}`}
                    checked={editService.isActive}
                    onChange={(e) => setEditService({ ...editService, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20 bg-background-secondary/10 text-section-primary focus:ring-section-primary"
                  />
                  <label htmlFor={`edit-active-${service.id}`} className="text-sm text-text-secondary">
                    Service is active
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" fullWidth onClick={handleCancel}>
                    <X size={16} className="mr-1" />
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" fullWidth onClick={handleUpdate}>
                    <Check size={16} className="mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-text-inverse">{service.serviceName}</h4>
                    {!service.isActive && (
                      <span className="px-2 py-0.5 text-xs bg-text-tertiary/20 text-text-tertiary rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  {service.description && (
                    <p className="text-sm text-text-secondary mt-1">{service.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-lg font-bold text-section-primary">
                      {formatPrice(service.price)}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-text-tertiary">
                      <Clock size={14} />
                      {formatDuration(service.durationMinutes)}
                    </span>
                  </div>
                </div>
                {isEditable && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(service)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-inverse hover:bg-white/10 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete?.(service.id)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add New Service Form */}
      {isAdding && (
        <div className="p-4 rounded-xl bg-background-secondary/10 border border-section-primary/30 space-y-3">
          <h4 className="text-sm font-medium text-text-inverse">Add New Service</h4>
          <Input
            label="Service Name"
            value={newService.serviceName}
            onChange={(e) => setNewService({ ...newService, serviceName: e.target.value })}
            placeholder="e.g., Personal Training Session"
          />
          <Input
            label="Description"
            value={newService.description}
            onChange={(e) => setNewService({ ...newService, description: e.target.value })}
            placeholder="Brief description of the service"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price (€)"
              type="number"
              min="0"
              step="0.01"
              value={newService.price || ''}
              onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) || 0 })}
              leftIcon={<DollarSign size={16} />}
            />
            <Input
              label="Duration (minutes)"
              type="number"
              min="15"
              step="15"
              value={newService.durationMinutes}
              onChange={(e) => setNewService({ ...newService, durationMinutes: parseInt(e.target.value) || 60 })}
              leftIcon={<Clock size={16} />}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="new-service-active"
              checked={newService.isActive}
              onChange={(e) => setNewService({ ...newService, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-white/20 bg-background-secondary/10 text-section-primary focus:ring-section-primary"
            />
            <label htmlFor="new-service-active" className="text-sm text-text-secondary">
              Service is active
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" fullWidth onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleAdd}
              disabled={!newService.serviceName.trim() || newService.price <= 0}
            >
              Add Service
            </Button>
          </div>
        </div>
      )}

      {services.length === 0 && !isAdding && (
        <div className="text-center py-6 bg-background-secondary/5 rounded-xl">
          <p className="text-text-tertiary text-sm">No services added yet</p>
          {isEditable && (
            <p className="text-text-tertiary/70 text-xs mt-1">
              Click "Add" to create your first service
            </p>
          )}
        </div>
      )}
    </div>
  );
}
