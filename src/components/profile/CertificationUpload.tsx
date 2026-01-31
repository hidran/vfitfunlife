'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Upload, X, FileText, Check, Trash2, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { uploadCertification, deleteCertification } from '@/lib/firebase/storage';
import { addCertification, removeCertification } from '@/lib/firebase/auth';
import { Certification } from '@/types/firebase';
import { Timestamp } from 'firebase/firestore';

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
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
      setError('Please select a PDF or image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleAdd = async () => {
    if (!newCert.name.trim() || !newCert.issuingOrganization.trim()) {
      setError('Name and issuing organization are required');
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
      setIsAdding(false);

      // Notify parent
      onUpdate?.(certifications);
    } catch (err) {
      console.error('Error adding certification:', err);
      setError('Failed to add certification');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (cert: Certification) => {
    if (!confirm('Are you sure you want to remove this certification?')) return;

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
      setError('Failed to remove certification');
    }
  };

  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return 'No expiry';
    const date = timestamp.toDate();
    return date.toLocaleDateString('it-IT', { year: 'numeric', month: 'short' });
  };

  const isExpired = (timestamp: Timestamp | null): boolean => {
    if (!timestamp) return false;
    return timestamp.toDate() < new Date();
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            Certifications ({certifications.length})
          </h3>
        </div>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            Add
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
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-text-tertiary">
                    Issued: {formatDate(cert.issueDate)}
                  </span>
                  {cert.expiryDate && (
                    <span
                      className={cn(
                        'text-xs',
                        isExpired(cert.expiryDate) ? 'text-error' : 'text-text-tertiary'
                      )}
                    >
                      Expires: {formatDate(cert.expiryDate)}
                      {isExpired(cert.expiryDate) && ' (Expired)'}
                    </span>
                  )}
                  {cert.isVerified && (
                    <span className="inline-flex items-center gap-1 text-xs text-success-DEFAULT">
                      <Check size={10} />
                      Verified
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDelete(cert)}
                className="p-2 rounded-lg text-error/70 hover:text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-inverse">Add Certification</h4>
            <button
              onClick={() => {
                setIsAdding(false);
                setError(null);
                setSelectedFile(null);
              }}
              className="p-1 rounded-lg text-text-tertiary hover:text-text-inverse hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <Input
              label="Certification Name"
              placeholder="e.g., Personal Trainer Certification"
              value={newCert.name}
              onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
            />

            <Input
              label="Issuing Organization"
              placeholder="e.g., ACE Fitness"
              value={newCert.issuingOrganization}
              onChange={(e) => setNewCert({ ...newCert, issuingOrganization: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Issue Date"
                type="date"
                value={newCert.issueDate}
                onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })}
              />
              <Input
                label="Expiry Date (optional)"
                type="date"
                value={newCert.expiryDate}
                onChange={(e) => setNewCert({ ...newCert, expiryDate: e.target.value })}
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Certificate Document (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border border-dashed transition-colors',
                  selectedFile
                    ? 'border-section-primary bg-section-gradient/5'
                    : 'border-white/20 hover:border-white/40'
                )}
              >
                {selectedFile ? (
                  <>
                    <FileText className="text-section-primary" size={20} />
                    <div className="flex-1 text-left">
                      <p className="text-sm text-text-inverse truncate">{selectedFile.name}</p>
                      <p className="text-xs text-text-tertiary">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="p-1 rounded text-text-tertiary hover:text-error"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="text-text-tertiary" size={20} />
                    <span className="text-sm text-text-secondary">
                      Click to upload PDF or image
                    </span>
                  </>
                )}
              </button>
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
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleAdd}
              disabled={isUploading || !newCert.name.trim() || !newCert.issuingOrganization.trim()}
              isLoading={isUploading}
            >
              Add Certification
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
