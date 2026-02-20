'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Image as ImageIcon, Plus, X, Trash2, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { uploadPortfolioImage, deletePortfolioImage } from '@/lib/firebase/storage';
import { addPortfolioImage, removePortfolioImage } from '@/lib/firebase/auth';
import { useI18n } from '@/hooks/useI18n';

interface PortfolioGalleryProps {
  userId: string;
  images: string[];
  onUpdate?: (images: string[]) => void;
  className?: string;
}

export function PortfolioGallery({
  userId,
  images,
  onUpdate,
  className,
}: PortfolioGalleryProps) {
  const { t } = useI18n();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          setError(t('profile.portfolio.error.invalidImage', { name: file.name }));
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setError(t('profile.portfolio.error.maxSize', { name: file.name }));
          continue;
        }

        // Upload file
        const downloadUrl = await uploadPortfolioImage(userId, file);
        uploadedUrls.push(downloadUrl);
        
        // Add to Firestore
        await addPortfolioImage(userId, downloadUrl);
        
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      onUpdate?.([...images, ...uploadedUrls]);
    } catch (err) {
      console.error('Error uploading images:', err);
      setError(t('profile.portfolio.error.upload'));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (imageUrl: string) => {
    if (!confirm(t('profile.portfolio.confirmDelete'))) return;

    try {
      // Delete from storage
      await deletePortfolioImage(imageUrl);
      
      // Remove from Firestore
      await removePortfolioImage(userId, imageUrl);
      
      onUpdate?.(images.filter((url) => url !== imageUrl));
    } catch (err) {
      console.error('Error removing image:', err);
      setError(t('profile.portfolio.error.remove'));
    }
  };

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = '';
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            {t('profile.portfolio.title', { count: images.length })}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Spinner size="sm" className="mr-1" />
                {Math.round(uploadProgress)}%
              </>
            ) : (
              <>
                <Plus size={16} className="mr-1" />
                {t('profile.portfolio.add')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
          {error}
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((url, index) => (
            <div
              key={url}
              className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
              onClick={() => openLightbox(index)}
            >
              <img
                src={url}
                alt={t('profile.portfolio.imageAlt', { index: index + 1 })}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightbox(index);
                    }}
                    className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(url);
                    }}
                    className="p-2 rounded-full bg-error/80 text-white hover:bg-error transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {/* Add More Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="aspect-square rounded-xl border-2 border-dashed border-white/20 hover:border-section-primary/50 flex flex-col items-center justify-center gap-2 transition-colors"
          >
            <Plus size={24} className="text-text-tertiary" />
            <span className="text-xs text-text-tertiary">{t('profile.portfolio.addPhoto')}</span>
          </button>
        </div>
      ) : (
        <div className="text-center py-8 bg-background-secondary/5 rounded-xl border-2 border-dashed border-white/10">
          <ImageIcon size={40} className="text-text-tertiary/50 mx-auto mb-3" />
          <p className="text-text-tertiary text-sm">{t('profile.portfolio.empty')}</p>
          <p className="text-text-tertiary/70 text-xs mt-1">
            {t('profile.portfolio.emptyHint')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('profile.portfolio.uploading')}
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                {t('profile.portfolio.uploadImages')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X size={24} />
          </button>

          {/* Navigation */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {/* Image Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 text-white text-sm">
            {currentImageIndex + 1} / {images.length}
          </div>

          {/* Image */}
          <img
            src={images[currentImageIndex]}
            alt={t('profile.portfolio.imageAlt', { index: currentImageIndex + 1 })}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
