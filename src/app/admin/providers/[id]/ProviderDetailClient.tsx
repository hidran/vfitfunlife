"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { Button } from "@/components/ui/button";
import { VerificationBadge, StatusBadge } from "@/components/admin";
import { formatDate, formatPrice, toDate } from "@/lib/utils";
import { AdminProvider } from "@/types/admin";
import { Timestamp } from "firebase/firestore";
import {
  ArrowLeft,
  Mail,
  Phone,
  Star,
  Calendar,
  CheckCircle,
  XCircle,
  FileText,
  ExternalLink,
  TrendingUp,
  CreditCard,
  Award,
  Briefcase,
} from "lucide-react";

interface ProviderDetailClientProps {
  providerId: string;
}

export default function ProviderDetailClient({ providerId }: ProviderDetailClientProps) {
  const router = useRouter();
  const { providers, fetchProviders, verifyProviderAction, rejectProviderAction } = useAdminStore();
  const [provider, setProvider] = useState<AdminProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "bookings" | "reviews">("overview");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    const loadProvider = async () => {
      if (!providerId) return;
      if (providers.length === 0) {
        await fetchProviders({});
      }
      const foundProvider = providers.find((p) => p.id === providerId);
      if (foundProvider) {
        setProvider(foundProvider as AdminProvider);
      }
      setIsLoading(false);
    };
    loadProvider();
  }, [providerId, providers, fetchProviders]);

  const handleVerify = async () => {
    if (!provider) return;
    try {
      await verifyProviderAction(provider.id, {
        status: "verified",
        verifiedAt: Timestamp.now(),
      });
      setProvider({ ...provider, providerProfile: { ...provider.providerProfile!, isVerified: true } });
    } catch (error) {
      console.error("Failed to verify provider:", error);
    }
  };

  const handleReject = async () => {
    if (!provider || !rejectReason.trim()) return;
    try {
      await rejectProviderAction(provider.id, rejectReason);
      setShowRejectForm(false);
      setRejectReason("");
    } catch (error) {
      console.error("Failed to reject provider:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-3 border-white/20 border-t-[#00C9FF] rounded-full animate-spin" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Provider not found</p>
        <Button variant="secondary" onClick={() => router.push("/admin/providers")} className="mt-4">
          Back to Providers
        </Button>
      </div>
    );
  }

  const metrics = (provider as any).performanceMetrics || {};
  const profile = provider.providerProfile;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push("/admin/providers")} className="text-white/60">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Providers
      </Button>

      {/* Profile Header */}
      <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {provider.avatarUrl ? (
              <Image
                src={provider.avatarUrl}
                alt={provider.fullName}
                width={96}
                height={96}
                unoptimized
                className="w-24 h-24 rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white text-3xl font-semibold">
                {provider.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{provider.fullName}</h1>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <VerificationBadge isVerified={profile?.isVerified ?? false} />
                  <StatusBadge status={(provider as any).isSuspended ? "suspended" : "active"} />
                  {profile?.specialties?.map((specialty) => (
                    <span
                      key={specialty}
                      className="px-2 py-0.5 bg-[#00C9FF]/10 text-[#00C9FF] text-xs rounded-full"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {!profile?.isVerified && (
                <div className="flex gap-2">
                  {!showRejectForm ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setShowRejectForm(true)}
                        className="flex items-center gap-2 text-[#EF4444] hover:text-[#EF4444]"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleVerify}
                        className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669]"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Verify
                      </Button>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setShowRejectForm(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleReject}
                        disabled={!rejectReason.trim()}
                        className="bg-[#EF4444] hover:bg-[#DC2626]"
                      >
                        Confirm Reject
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {showRejectForm && (
              <div className="mt-4 p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl">
                <label className="block text-sm font-medium text-white mb-2">
                  Rejection Reason
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#EF4444]/50 resize-none"
                  rows={2}
                />
              </div>
            )}

            {/* Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Email</p>
                  <p className="text-sm text-white truncate">{provider.email || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Phone</p>
                  <p className="text-sm text-white">{provider.phone || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Star className="w-5 h-5 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Rating</p>
                  <p className="text-sm text-white">
                    {profile?.rating?.toFixed(1) || "0.0"} ({profile?.reviewCount || 0} reviews)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Experience</p>
                  <p className="text-sm text-white">{profile?.yearsOfExperience || 0} years</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Total Bookings</p>
              <p className="text-xl font-bold text-white">{metrics.totalBookings || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Completion Rate</p>
              <p className="text-xl font-bold text-white">
                {metrics.totalBookings
                  ? Math.round((metrics.completedBookings / metrics.totalBookings) * 100)
                  : 0}
                %
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Total Revenue</p>
              <p className="text-xl font-bold text-white">
                {formatPrice(metrics.totalRevenue || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Commission Paid</p>
              <p className="text-xl font-bold text-white">
                {formatPrice(metrics.commissionPaid || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex gap-6">
          {[
            { id: "overview", label: "Overview", icon: Briefcase },
            { id: "documents", label: "Documents", icon: FileText },
            { id: "bookings", label: "Bookings", icon: Calendar },
            { id: "reviews", label: "Reviews", icon: Star },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "text-[#00C9FF] border-[#00C9FF]"
                  : "text-white/50 border-transparent hover:text-white"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Professional Bio */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Professional Bio</h3>
              <p className="text-white/70 whitespace-pre-wrap">
                {profile?.professionalBio || "No bio provided"}
              </p>
            </div>

            {/* Certifications */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Certifications</h3>
              {profile?.certifications && profile.certifications.length > 0 ? (
                <div className="space-y-3">
                  {profile.certifications.map((cert) => (
                    <div key={cert.id} className="flex items-start gap-3 p-3 bg-black/20 rounded-xl">
                      <Award className="w-5 h-5 text-[#00C9FF] flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{cert.name}</p>
                        <p className="text-sm text-white/50">{cert.issuingOrganization}</p>
                        <p className="text-xs text-white/40 mt-1">
                          Issued: {formatDate(toDate(cert.issueDate) || new Date())}
                          {cert.expiryDate && ` · Expires: ${formatDate(toDate(cert.expiryDate) || new Date())}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/50">No certifications added</p>
              )}
            </div>

            {/* Services */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Services</h3>
              {profile?.servicePricing && profile.servicePricing.length > 0 ? (
                <div className="space-y-3">
                  {profile.servicePricing.map((service) => (
                    <div key={service.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                      <div>
                        <p className="font-medium text-white">{service.serviceName}</p>
                        <p className="text-sm text-white/50">
                          {service.durationMinutes} minutes
                        </p>
                      </div>
                      <span className="font-semibold text-white">
                        {formatPrice(service.price)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/50">No services added</p>
              )}
            </div>

            {/* Languages */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Languages</h3>
              {profile?.languages && profile.languages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-full text-sm"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-white/50">No languages specified</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Verification Documents</h3>
            {(provider as any).verificationDocuments?.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(provider as any).verificationDocuments.map((doc: any) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 bg-black/20 rounded-xl hover:bg-black/30 transition-colors group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-[#00C9FF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{doc.name}</p>
                      <p className="text-sm text-white/50 capitalize">{doc.type}</p>
                      <p className="text-xs text-white/40">
                        Uploaded: {formatDate(doc.uploadedAt.toDate())}
                      </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-white/40 group-hover:text-white" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/50">No documents uploaded</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-8 text-center">
            <Calendar className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">Provider bookings will be displayed here</p>
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-8 text-center">
            <Star className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">Provider reviews will be displayed here</p>
          </div>
        )}
      </div>
    </div>
  );
}
