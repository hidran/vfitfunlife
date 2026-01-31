'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Camera, Upload, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { updateProfilePhoto } from '@/lib/firebase/storage';
import { updateUserProfile } from '@/lib/firebase/auth';

interface ProfilePhotoUploaderProps {
  userId: string;
  currentPhotoUrl?: string | null;
  displayName?: string;
  onPhotoUpdated?: (url: string) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-16 h-16',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
  xl: 'w-36 h-36',
};

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export function ProfilePhotoUploader({
  userId,
  currentPhotoUrl,
  displayName,
  onPhotoUpdated,
  size = 'lg',
  className,
}: ProfilePhotoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setError(null);
    setSuccess(false);

    // Upload file
    setIsUploading(true);
    try {
      const downloadUrl = await updateProfilePhoto(userId, file);
      
      // Update user profile with new photo URL
      await updateUserProfile(userId, { avatarUrl: downloadUrl });
      
      setSuccess(true);
      onPhotoUpdated?.(downloadUrl);
      
      // Clear success after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload photo. Please try again.');
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayUrl = previewUrl || currentPhotoUrl;
  const initials = displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative">
        {/* Photo Container */}
        <div
          className={cn(
            'relative rounded-full overflow-hidden bg-gradient-to-br from-vfit-primary via-vfun-primary to-vlife-primary p-0.5 cursor-pointer group',
            sizeClasses[size]
          )}
          onClick={handleClick}
        >
          <div className="w-full h-full rounded-full bg-background-dark flex items-center justify-center overflow-hidden">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={displayName || 'Profile'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-text-inverse font-semibold text-lg">
                {initials}
              </span>
            )}
            
            {/* Overlay */}
            <div className={cn(
              'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200',
              isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}>
              {isUploading ? (
                <Spinner size="sm" />
              ) : (
                <Camera className="text-white" size={iconSizes[size]} />
              )}
            </div>

            {/* Success Check */}
            {success && (
              <div className="absolute inset-0 bg-success-DEFAULT/80 flex items-center justify-center animate-fade-in">
                <Check className="text-white" size={iconSizes[size]} />
              </div>
            )}
          </div>
        </div>

        {/* Upload Button (visible on hover) */}
        <button
          onClick={handleClick}
          disabled={isUploading}
          className={cn(
            'absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-section-gradient flex items-center justify-center shadow-lg transition-all duration-200',
            'hover:scale-110 active:scale-95',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Upload className="text-white" size={14} />
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {/* Error Message */}
      {error && (
        <div className="mt-2 flex items-center gap-1 text-error text-xs">
          <X size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-2 flex items-center gap-1 text-success-DEFAULT text-xs">
          <Check size={12} />
          <span>Photo updated!</span>
        </div>
      )}
    </div>
  );
}
