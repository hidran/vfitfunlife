'use client';
import { useRef, useState } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { useUpdateAvatar } from '@/lib/profile-mutations';
import { Camera } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface Props { currentUrl: string | null; uid: string; onUploaded?: (url: string) => void; }

/** Resize an image File to a 512x512 center-cropped JPEG via canvas. */
async function resizeToSquare(file: File, size = 512): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    const objectUrl = URL.createObjectURL(file);
    el.onload = () => { URL.revokeObjectURL(objectUrl); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    el.src = objectUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const src = Math.min(img.width, img.height);
  const sx = (img.width - src) / 2;
  const sy = (img.height - src) / 2;
  ctx.drawImage(img, sx, sy, src, src, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
}

export function AvatarUploader({ currentUrl, uid, onUploaded }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mut = useUpdateAvatar();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setBusy(true);
    try {
      const blob = await resizeToSquare(file);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const storage = getStorage();
      const objRef = ref(storage, `avatars/${uid}/${filename}`);
      await uploadBytes(objRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(objRef);
      await mut.mutateAsync(url);
      onUploaded?.(url);
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="Current avatar" className="h-24 w-24 rounded-full object-cover" />
      )}
      <label htmlFor="avatar-input" className="inline-flex">
        <input
          id="avatar-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="sr-only"
          aria-label={t('profile.settings.avatar.uploadCta')}
        />
        <Button type="button" isLoading={busy || mut.isPending} onClick={() => inputRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" /> {t('profile.settings.avatar.uploadCta')}
        </Button>
      </label>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
