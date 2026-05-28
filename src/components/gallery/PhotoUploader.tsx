'use client';
import { useRef, useState } from 'react';
import { Camera as CameraIcon, X, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { uploadGalleryPhoto, deleteGalleryPhoto, type GalleryScope } from '@/lib/firebase/photos';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface PhotoUploaderProps {
  scope: GalleryScope;
  entityId: string;
  photos: string[];
  onChange: (newPhotos: string[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
}

const MAX_PHOTOS_DEFAULT = 10;

export function PhotoUploader({
  scope,
  entityId,
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS_DEFAULT,
  disabled = false,
}: PhotoUploaderProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = photos.length < maxPhotos && !disabled && !busy;

  async function captureNative(): Promise<File | null> {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (!photo.dataUrl) return null;
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      return new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
    } catch (err) {
      console.warn('[PhotoUploader] capture cancelled or denied', err);
      return null;
    }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadGalleryPhoto({ scope, entityId, file });
      onChange([...photos, url]);
    } catch (err) {
      console.error('[PhotoUploader] upload failed', err);
      setError(t('gallery.uploadError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddClick() {
    if (!canAdd) return;
    if (Capacitor.isNativePlatform()) {
      const file = await captureNative();
      if (file) await uploadFile(file);
    } else {
      inputRef.current?.click();
    }
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await uploadFile(f);
    e.target.value = '';
  }

  async function handleDelete(url: string) {
    onChange(photos.filter((p) => p !== url));
    await deleteGalleryPhoto(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((url, i) => (
          <div
            key={url}
            className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-slate-200"
          >
            <img src={url} alt={t('gallery.photoAlt', { index: i + 1 })} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(url)}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
              aria-label={t('gallery.removePhoto')}
            >
              <X className="h-3 w-3" />
            </button>
            {i === 0 && (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {t('gallery.cover')}
              </span>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={handleAddClick}
            className={cn(
              'inline-flex h-28 w-28 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/30 bg-white/5 text-text-secondary',
              busy && 'opacity-50'
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CameraIcon className="h-5 w-5" />}
            <span className="text-[10px]">{busy ? t('gallery.uploading') : t('gallery.addPhoto')}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-text-tertiary">
        {t('gallery.photoCount', { count: photos.length, max: maxPhotos })}
      </p>
    </div>
  );
}
