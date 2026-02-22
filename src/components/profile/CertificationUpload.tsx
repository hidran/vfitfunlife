'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Image from 'next/image';
import { Upload, X, FileText, Check, Trash2, Award, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadCertification, deleteCertification } from '@/lib/firebase/storage';
import { addCertification, removeCertification } from '@/lib/firebase/auth';
import { Certification } from '@/types/firebase';
import { Timestamp } from 'firebase/firestore';
import { useI18n } from '@/hooks/useI18n';

interface CertificationUploadProps {
  userId: string;
  certifications: Certification[];
  onUpdate?: (certifications: Certification[]) => void;
  className?: string;
}

export function CertificationUpload({
  userId,
  certifications,
  onUpdate,
  className,
}: CertificationUploadProps) {
  const { locale, t } = useI18n();
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'image' | null>(null);
  const [newCert, setNewCert] = useState({
    name: '',
    issuingOrganization: '',
    issueDate: '',
    expiryDate: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('profile.certifications.error.fileType'));
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError(t('profile.certifications.error.fileSize'));
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
        setPreviewType('image');
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      setPreviewUrl(URL.createObjectURL(file));
      setPreviewType('pdf');
    }
  };

  const handleAdd = async () => {
    if (!newCert.name.trim() || !newCert.issuingOrganization.trim()) {
      setError(t('profile.certifications.error.requiredFields'));
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      let documentUrl: string | null = null;

      // Upload file if selected
      if (selectedFile) {
        documentUrl = await uploadCertification(userId, selectedFile, newCert.name);
      }

      // Create certification object
      const certificationData: Omit<Certification, 'id'> = {
        name: newCert.name,
        issuingOrganization: newCert.issuingOrganization,
        issueDate: Timestamp.fromDate(new Date(newCert.issueDate || Date.now())),
        expiryDate: newCert.expiryDate ? Timestamp.fromDate(new Date(newCert.expiryDate)) : null,
        documentUrl,
        isVerified: false,
      };

      // Add to Firestore
      await addCertification(userId, certificationData);

      // Reset form
      setNewCert({
        name: '',
        issuingOrganization: '',
        issueDate: '',
        expiryDate: '',
      });
      setSelectedFile(null);
      setPreviewUrl(null);
      setPreviewType(null);
      setIsAdding(false);

      // Notify parent
      onUpdate?.(certifications);
    } catch (err) {
      console.error('Error adding certification:', err);
      setError(t('profile.certifications.error.save'));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (cert: Certification) => {
    if (!confirm(t('profile.certifications.confirmDelete'))) return;

    try {
      // Delete document from storage if exists
      if (cert.documentUrl) {
        await deleteCertification(cert.documentUrl);
      }

      // Remove from Firestore
      await removeCertification(userId, cert);

      // Notify parent
      onUpdate?.(certifications.filter((c) => c.id !== cert.id));
    } catch (err) {
      console.error('Error removing certification:', err);
      setError(t('profile.certifications.error.remove'));
    }
  };

  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return t('profile.certifications.noExpiry');
    const date = timestamp.toDate();
    const localeTag = {
      it: 'it-IT',
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
    }[locale];
    return date.toLocaleDateString(localeTag, { year: 'numeric', month: 'short' });
  };

  const isExpired = (timestamp: Timestamp | null): boolean => {
    if (!timestamp) return false;
    return timestamp.toDate() < new Date();
  };

  const isPdf = (url?: string | null): boolean => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.pdf');
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            {t('profile.certifications.title', { count: certifications.length })}
          </h3>
        </div>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            {t('profile.certifications.add')}
          </Button>
        )}
      </div>

      {/* Certification List */}
      {certifications.length > 0 && (
        <div className="space-y-2">
          {certifications.map((cert) => (
            <div
              key={cert.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-background-secondary/5 border border-white/5"
            >
              <div className="w-10 h-10 rounded-lg bg-section-gradient/10 flex items-center justify-center flex-shrink-0">
                {cert.documentUrl ? (
                  <FileText className="text-section-primary" size={18} />
                ) : (
                  <Award className="text-section-primary" size={18} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-inverse text-sm truncate">
                  {cert.name}
                </p>
                <p className="text-xs text-text-tertiary truncate">
                  {cert.issuingOrganization}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-text-tertiary">
                    {t('profile.certifications.issued')}: {formatDate(cert.issueDate)}
                  </span>
                  {cert.expiryDate && (
                    <span
                      className={cn(
                        'text-xs',
                        isExpired(cert.expiryDate) ? 'text-error' : 'text-text-tertiary'
                      )}
                    >
                      {t('profile.certifications.expires')}: {formatDate(cert.expiryDate)}
                      {isExpired(cert.expiryDate) && ` (${t('profile.certifications.expired')})`}
                    </span>
                  )}
                  {cert.isVerified && (
                    <span className="inline-flex items-center gap-1 text-xs text-success-DEFAULT">
                      <Check size={10} />
                      {t('profile.certifications.verified')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {cert.documentUrl && (
                  <a
                    href={cert.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-text-tertiary hover:text-section-primary hover:bg-section-primary/10 transition-colors"
                    title={isPdf(cert.documentUrl) ? t('profile.certifications.viewPdf') : t('profile.certifications.viewImage')}
                  >
                    <Eye size={16} />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(cert)}
                  className="p-2 rounded-lg text-error/70 hover:text-error hover:bg-error/10 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-inverse">{t('profile.certifications.addTitle')}</h4>
            <button
              onClick={() => {
                setIsAdding(false);
                setError(null);
                clearFileSelection();
              }}
              className="p-1 rounded-lg text-text-tertiary hover:text-text-inverse hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <Input
              label={t('profile.certifications.field.name')}
              placeholder={t('profile.certifications.placeholder.name')}
              value={newCert.name}
              onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
            />

            <Input
              label={t('profile.certifications.field.organization')}
              placeholder={t('profile.certifications.placeholder.organization')}
              value={newCert.issuingOrganization}
              onChange={(e) => setNewCert({ ...newCert, issuingOrganization: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('profile.certifications.field.issueDate')}
                type="date"
                value={newCert.issueDate}
                onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })}
              />
              <Input
                label={t('profile.certifications.field.expiryDate')}
                type="date"
                value={newCert.expiryDate}
                onChange={(e) => setNewCert({ ...newCert, expiryDate: e.target.value })}
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.certifications.field.document')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {/* Preview */}
              {previewUrl && previewType === 'image' && (
                <div className="relative mb-3 h-40 rounded-xl overflow-hidden bg-background-secondary/10">
                  <Image
                    src={previewUrl}
                    alt={t('profile.certifications.previewAlt')}
                    fill
                    sizes="(max-width: 768px) 100vw, 640px"
                    unoptimized
                    className="object-contain"
                  />
                  <button
                    onClick={clearFileSelection}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {previewUrl && previewType === 'pdf' && (
                <div className="relative mb-3 p-4 rounded-xl bg-background-secondary/10 border border-white/10">
                  <div className="flex items-center gap-3">
                    <FileText className="text-section-primary" size={32} />
                    <div className="flex-1">
                      <p className="text-sm text-text-inverse font-medium">
                        {selectedFile?.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {t('profile.certifications.pdfDocument')}
                      </p>
                    </div>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-text-tertiary hover:text-section-primary hover:bg-section-primary/10 transition-colors"
                    >
                      <Eye size={18} />
                    </a>
                    <button
                      onClick={clearFileSelection}
                      className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )}

              {!previewUrl && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border border-dashed transition-colors',
                    selectedFile
                      ? 'border-section-primary bg-section-gradient/5'
                      : 'border-white/20 hover:border-white/40'
                  )}
                >
                  <Upload className="text-text-tertiary" size={20} />
                  <span className="text-sm text-text-secondary">
                    {t('profile.certifications.uploadPrompt')}
                  </span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => {
                setIsAdding(false);
                setError(null);
                clearFileSelection();
              }}
              disabled={isUploading}
            >
              {t('profile.certifications.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleAdd}
              disabled={isUploading || !newCert.name.trim() || !newCert.issuingOrganization.trim()}
              isLoading={isUploading}
            >
              <Check size={16} className="mr-1" />
              {t('profile.certifications.add')}
            </Button>
          </div>
        </div>
      )}

      {certifications.length === 0 && !isAdding && (
        <div className="text-center py-6 bg-background-secondary/5 rounded-xl">
          <p className="text-text-tertiary text-sm">{t('profile.certifications.empty')}</p>
          <p className="text-text-tertiary/70 text-xs mt-1">
            {t('profile.certifications.emptyHint')}
          </p>
        </div>
      )}
    </div>
  );
}
