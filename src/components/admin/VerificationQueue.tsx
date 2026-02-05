"use client";

import { useState } from "react";
import { cn, formatDate, toDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminProvider } from "@/types/admin";
import { VerificationBadge } from "./UserRoleBadge";
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
  onApprove: (providerId: string) => void;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const handleApprove = (providerId: string) => {
    onApprove(providerId);
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
      <div className={cn("bg-[#1E2230] rounded-2xl border border-white/10 p-8 text-center", className)}>
        <CheckCircle className="w-12 h-12 text-[#10B981] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">All Caught Up!</h3>
        <p className="text-white/50">No pending provider verifications.</p>
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
              "bg-[#1E2230] rounded-2xl border border-white/10 overflow-hidden transition-all",
              isExpanded && "border-[#00C9FF]/30"
            )}
          >
            {/* Header */}
            <div
              className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : provider.id)}
            >
              {/* Avatar */}
              {provider.avatarUrl ? (
                <img
                  src={provider.avatarUrl}
                  alt={provider.fullName}
                  className="w-12 h-12 rounded-xl object-cover border border-white/10"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
                  <User className="w-5 h-5" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white truncate">
                  {provider.fullName}
                </h4>
                <p className="text-sm text-white/50">{provider.email}</p>
              </div>

              {/* Status */}
              <VerificationBadge
                isVerified={provider.providerProfile?.isVerified ?? false}
              />

              {/* Expand Icon */}
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-white/40" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white/40" />
              )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-white/10">
                <div className="pt-4 space-y-4">
                  {/* Provider Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-white/40" />
                        <span className="text-white/50">Joined:</span>
                        <span className="text-white">
                          {formatDate(toDate(provider.createdAt) || new Date())}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-white/40" />
                        <span className="text-white/50">Experience:</span>
                        <span className="text-white">
                          {provider.providerProfile?.yearsOfExperience || 0} years
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-white/40" />
                        <span className="text-white/50">License:</span>
                        <span className="text-white">
                          {provider.providerProfile?.licenseNumber || "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  {provider.providerProfile?.professionalBio && (
                    <div>
                      <h5 className="text-sm font-medium text-white/70 mb-2">
                        Professional Bio
                      </h5>
                      <p className="text-sm text-white/50 bg-black/20 rounded-lg p-3">
                        {provider.providerProfile.professionalBio}
                      </p>
                    </div>
                  )}

                  {/* Specialties */}
                  {provider.providerProfile?.specialties && (
                    <div>
                      <h5 className="text-sm font-medium text-white/70 mb-2">
                        Specialties
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {provider.providerProfile.specialties.map((specialty) => (
                          <span
                            key={specialty}
                            className="px-2.5 py-1 bg-[#00C9FF]/10 text-[#00C9FF] text-xs rounded-full"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents */}
                  {provider.verificationDocuments && provider.verificationDocuments.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-white/70 mb-2">
                        Verification Documents
                      </h5>
                      <div className="space-y-2">
                        {provider.verificationDocuments.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-black/20 rounded-lg hover:bg-black/30 transition-colors group"
                          >
                            <FileText className="w-5 h-5 text-[#00C9FF]" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">
                                {doc.name}
                              </p>
                              <p className="text-xs text-white/40 capitalize">
                                {doc.type}
                              </p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-white" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {provider.providerProfile?.certifications && provider.providerProfile.certifications.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-white/70 mb-2">
                        Certifications
                      </h5>
                      <div className="space-y-2">
                        {provider.providerProfile.certifications.map((cert) => (
                          <div
                            key={cert.id}
                            className="flex items-center gap-3 p-3 bg-black/20 rounded-lg"
                          >
                            <FileText className="w-5 h-5 text-[#7B61FF]" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">
                                {cert.name}
                              </p>
                              <p className="text-xs text-white/40">
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
                      <label className="block text-sm font-medium text-white mb-2">
                        Rejection Reason
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter reason for rejection..."
                        className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#EF4444]/50 resize-none"
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
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleReject(provider.id)}
                          disabled={!rejectReason.trim() || isLoading}
                          className="flex-1 bg-[#EF4444] hover:bg-[#DC2626]"
                        >
                          Confirm Reject
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
                        className="flex-1 bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30 border-[#EF4444]/30"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleApprove(provider.id)}
                        disabled={isLoading}
                        className="flex-1 bg-[#10B981] hover:bg-[#059669]"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
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
