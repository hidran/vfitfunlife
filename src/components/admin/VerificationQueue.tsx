"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, formatDate, toDate, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminProvider } from "@/types/admin";
import { VerificationBadge, ProviderTypeBadge } from "./UserRoleBadge";
import { useI18n } from "@/hooks/useI18n";
import { useAdminProviderBusiness } from "@/hooks/useAdminProviderBusiness";
import { businessReviewOf } from "@/lib/admin/providerBusiness";
import type { BusinessReview } from "@/lib/firebase/functions";
import { BusinessBadge } from "@/components/provider/BusinessBadge";
import { BusinessReviewCard } from "./providers/BusinessReviewCard";
import {
  CheckCircle,
  XCircle,
  FileText,
  User,
  Calendar,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface VerificationQueueProps {
  providers: AdminProvider[];
  /**
   * `expectedReview` is set for a company: the tax id, legal name, legal form and affiliation number shown in its expanded
   * row, which the server requires (and compares) to approve it. Undefined for individuals.
   */
  onApprove: (providerId: string, expectedReview?: BusinessReview) => void;
  onReject: (providerId: string, reason: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function VerificationQueue({
  providers,
  onApprove,
  onReject,
  isLoading = false,
  className,
}: VerificationQueueProps) {
  const { t, locale } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  // One row is open at a time, and only an open company can be approved: its business map is
  // read when it is expanded (users.providerType marks it; the server decides by the map).
  const expanded = providers.find((p) => p.id === expandedId);
  const expandedIsCompany = expanded?.providerType === "business";
  const businessQuery = useAdminProviderBusiness(expandedId ?? "", expandedIsCompany);
  const expandedBusiness = expandedIsCompany ? businessQuery.data ?? null : null;

  const handleApprove = (providerId: string) => {
    onApprove(providerId, expandedBusiness ? businessReviewOf(expandedBusiness) : undefined);
    setExpandedId(null);
  };

  const handleReject = (providerId: string) => {
    if (rejectReason.trim()) {
      onReject(providerId, rejectReason);
      setRejectReason("");
      setShowRejectModal(null);
      setExpandedId(null);
    }
  };

  if (providers.length === 0) {
    return (
      <div className={cn("bg-surface rounded-2xl border border-hairline p-8 text-center", className)}>
        <CheckCircle className="w-12 h-12 text-[#10B981] light:text-emerald-700 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-content mb-2">{t('admin.verifications.allCaughtUp')}</h3>
        <p className="text-content-muted">{t('admin.verifications.noPending')}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {providers.map((provider) => {
        const isExpanded = expandedId === provider.id;
        const isRejecting = showRejectModal === provider.id;

        return (
          <div
            key={provider.id}
            className={cn(
              "bg-surface rounded-2xl border border-hairline overflow-hidden transition-all",
              isExpanded && "border-[#00C9FF]/30"
            )}
          >
            {/* Header */}
            <div
              className="p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : provider.id)}
            >
              {/* Avatar */}
              {provider.avatarUrl ? (
                <Image
                  src={provider.avatarUrl}
                  alt={provider.fullName}
                  width={48}
                  height={48}
                  unoptimized
                  className="w-12 h-12 rounded-xl object-cover border border-hairline"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
                  <User className="w-5 h-5" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-content truncate">
                  {provider.fullName}
                </h4>
                <p className="text-sm text-content-muted">{provider.email}</p>
              </div>

              {provider.providerType === "business" && <BusinessBadge />}

              {/* Status */}
              <VerificationBadge
                isVerified={provider.providerProfile?.isVerified ?? false}
              />
              <ProviderTypeBadge userType={provider.userType} size="sm" />

              {/* Expand Icon */}
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-content-faint" />
              ) : (
                <ChevronDown className="w-5 h-5 text-content-faint" />
              )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-hairline">
                <div className="pt-4 space-y-4">
                  {/* A company is approved for exactly these details (expectedReview). */}
                  {expandedIsCompany &&
                    (expandedBusiness ? (
                      <BusinessReviewCard business={expandedBusiness} className="bg-surface-sunken" />
                    ) : businessQuery.isLoading ? (
                      <p className="text-sm text-content-muted">{t('common.loading')}</p>
                    ) : businessQuery.isError ? (
                      <p role="alert" className="text-sm text-red-400 light:text-red-700">
                        {t('admin.business.loadError')}
                      </p>
                    ) : null)}

                  {/* Provider Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-content-faint" />
                        <span className="text-content-muted">{t('admin.verifications.joined')}</span>
                        <span className="text-content">
                          {formatDate(toDate(provider.createdAt) || new Date(), locale)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-content-faint" />
                        <span className="text-content-muted">{t('admin.verifications.experience')}</span>
                        <span className="text-content">
                          {provider.providerProfile?.yearsOfExperience || 0} {t('admin.verifications.years')}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-content-faint" />
                        <span className="text-content-muted">{t('admin.verifications.license')}</span>
                        <span className="text-content">
                          {provider.providerProfile?.licenseNumber || t('admin.verifications.na')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  {provider.providerProfile?.professionalBio && (
                    <div>
                      <h5 className="text-sm font-medium text-content-muted mb-2">
                        {t('admin.verifications.professionalBio')}
                      </h5>
                      <p className="text-sm text-content-muted bg-surface-sunken rounded-lg p-3">
                        {provider.providerProfile.professionalBio}
                      </p>
                    </div>
                  )}

                  {/* Specialties */}
                  {provider.providerProfile?.specialties && (
                    <div>
                      <h5 className="text-sm font-medium text-content-muted mb-2">
                        {t('admin.verifications.specialties')}
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {provider.providerProfile.specialties.map((specialty) => (
                          <span
                            key={specialty}
                            className="px-2.5 py-1 bg-[#00C9FF]/10 text-[#00C9FF] light:text-cyan-700 text-xs rounded-full"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Services */}
                  <div>
                    <h5 className="text-sm font-medium text-content-muted mb-2">
                      {t('admin.verifications.services')}
                    </h5>
                    {Array.isArray(provider.providerProfile?.servicePricing) &&
                    provider.providerProfile.servicePricing.length > 0 ? (
                      <div className="space-y-2">
                        {provider.providerProfile.servicePricing.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between p-3 bg-surface-sunken rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-content truncate">
                                {service.serviceName}
                              </p>
                              <p className="text-xs text-content-faint">
                                {t('admin.providerDetail.serviceDurationMinutes', { count: String(service.durationMinutes) })}
                              </p>
                            </div>
                            <span className="text-sm text-content whitespace-nowrap ml-3">
                              {formatPrice(service.price, locale)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-content-muted text-sm">{t('admin.verifications.noServices')}</p>
                    )}
                  </div>

                  {/* Documents */}
                  {provider.verificationDocuments && provider.verificationDocuments.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-content-muted mb-2">
                        {t('admin.verifications.documents')}
                      </h5>
                      <div className="space-y-2">
                        {provider.verificationDocuments.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg hover:bg-surface-sunken transition-colors group"
                          >
                            <FileText className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-content truncate">
                                {doc.name}
                              </p>
                              <p className="text-xs text-content-faint capitalize">
                                {doc.type}
                              </p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-content-faint group-hover:text-content" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {provider.providerProfile?.certifications && provider.providerProfile.certifications.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-content-muted mb-2">
                        {t('admin.verifications.certifications')}
                      </h5>
                      <div className="space-y-2">
                        {provider.providerProfile.certifications.map((cert) => (
                          <div
                            key={cert.id}
                            className="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg"
                          >
                            <FileText className="w-5 h-5 text-[#7B61FF] light:text-violet-700" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-content truncate">
                                {cert.name}
                              </p>
                              <p className="text-xs text-content-faint">
                                {cert.issuingOrganization}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reject Reason Input */}
                  {isRejecting && (
                    <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4">
                      <label className="block text-sm font-medium text-content mb-2">
                        {t('admin.verifications.rejectionReason')}
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={t('admin.verifications.rejectionPlaceholder')}
                        className="w-full px-3 py-2 bg-surface-sunken border border-hairline rounded-lg text-content text-sm placeholder:text-content-faint focus:outline-none focus:border-[#EF4444]/50 resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowRejectModal(null);
                            setRejectReason("");
                          }}
                          className="flex-1"
                        >
                          {t('admin.verifications.cancel')}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleReject(provider.id)}
                          disabled={!rejectReason.trim() || isLoading}
                          className="flex-1 bg-[#EF4444] hover:bg-[#DC2626]"
                        >
                          {t('admin.verifications.confirmReject')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!isRejecting && (
                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => setShowRejectModal(provider.id)}
                        disabled={isLoading}
                        className="flex-1 bg-[#EF4444]/20 text-[#EF4444] light:text-red-700 hover:bg-[#EF4444]/30 border-[#EF4444]/30"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        {t('admin.verifications.reject')}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleApprove(provider.id)}
                        // Wait for a fresh read of the company: what is sent is what is shown.
                        disabled={isLoading || (expandedIsCompany && businessQuery.isFetching)}
                        className="flex-1 bg-emerald-700 hover:bg-emerald-800"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {t('admin.verifications.approve')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
