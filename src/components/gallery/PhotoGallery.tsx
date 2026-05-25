'use client';
import { useState } from 'react';
import { PhotoLightbox } from './PhotoLightbox';
import { cn } from '@/lib/utils';

interface PhotoGalleryProps {
  photos: string[];
  className?: string;
}

export function PhotoGallery({ photos, className }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-hide',
          className
        )}
      >
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="relative h-56 w-72 flex-shrink-0 snap-center overflow-hidden rounded-2xl bg-slate-200"
            aria-label={`Apri foto ${i + 1}`}
          >
            <img
              src={url}
              alt={`Foto ${i + 1}`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
