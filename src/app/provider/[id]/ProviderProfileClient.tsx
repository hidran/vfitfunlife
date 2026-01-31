'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ChevronLeft,
  Star,
  MapPin,
  Clock,
  Award,
  Globe,
  Calendar,
  MessageSquare,
  Share2,
  Heart,
  Check,
  Shield,
  Briefcase,
  GraduationCap,
  Languages,
} from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Rating } from '@/components/ui/Rating';
import { getProviderProfile, isProvider } from '@/lib/firebase/auth';
import { getUserData } from '@/lib/firebase/auth';
import { ProviderProfile as ProviderProfileType, Certification, Education, User } from '@/types/firebase';
import { Timestamp } from 'firebase/firestore';
import { getPortfolioImages } from '@/lib/firebase/storage';

interface ProviderPublicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  providerProfile: ProviderProfileType | null;
  socialLinks: {
    instagram?: string;
    linkedin?: string;
    website?: string;
    facebook?: string;
    twitter?: string;
  } | null;
  isProvider: boolean;
}

export default function ProviderProfileClient() {
  const router = useRouter();
  const params = useParams();
  const providerId = params.id as string;

  const [profile, setProfile] = useState<ProviderPublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!providerId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Check if user is a provider
        const isProv = await isProvider(providerId);
        if (!isProv) {
          setError('Provider not found');
          return;
        }

        // Get user data
        const userData = await getUserData(providerId);
        if (!userData) {
          setError('Provider not found');
          return;
        }

        // Get provider profile
        const providerProfile = await getProviderProfile(providerId);

        // Get portfolio images
        const images = await getPortfolioImages(providerId);

        setProfile({
          id: providerId,
          fullName: userData.fullName || 'Unknown Provider',
          avatarUrl: userData.avatarUrl || null,
          bio: userData.bio || null,
          providerProfile,
          socialLinks: userData.socialLinks || null,
          isProvider: true,
        });
        setPortfolioImages(images);
      } catch (err) {
        console.error('Error loading provider profile:', err);
        setError('Failed to load provider profile');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [providerId]);

  const handleBookNow = () => {
    router.push(`/book/provider/${providerId}`);
  };

  const handleContact = () => {
    router.push(`/chat/${providerId}`);
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: `${profile?.fullName} - VFit Provider`,
        text: profile?.providerProfile?.professionalBio || '',
        url: window.location.href,
      });
    } catch {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-4">
        <p className="text-error text-lg">{error || 'Provider not found'}</p>
        <Button variant="primary" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const providerData = profile.providerProfile;
  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isLiked ? 'text-error' : 'text-text-secondary hover:text-text-inverse'
              )}
            >
              <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-white/10 transition-colors"
            >
              <Share2 size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Profile Header */}
      <div className="px-4 pb-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-vfit-primary via-vfun-primary to-vlife-primary p-0.5 flex-shrink-0">
            <div className="w-full h-full rounded-full bg-background-dark flex items-center justify-center overflow-hidden">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-text-inverse">{initials}</span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-inverse">{profile.fullName}</h1>
            
            {providerData?.isVerified && (
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="success" size="sm">
                  <Check size={10} className="mr-1" />
                  Verified
                </Badge>
              </div>
            )}

            {/* Rating */}
            {providerData && (
              <div className="flex items-center gap-2 mt-2">
                <Rating value={providerData.rating} size="sm" />
                <span className="text-sm text-text-secondary">
                  {providerData.rating.toFixed(1)} ({providerData.reviewCount} reviews)
                </span>
              </div>
            )}

            {/* Years of Experience */}
            {providerData && providerData.yearsOfExperience > 0 && (
              <p className="text-sm text-text-tertiary mt-1">
                {providerData?.yearsOfExperience} {(providerData?.yearsOfExperience || 0) === 1 ? 'year' : 'years'} experience
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {(profile.bio || providerData?.professionalBio) && (
          <p className="mt-4 text-text-secondary leading-relaxed">
            {providerData?.professionalBio || profile.bio}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <Button variant="primary" size="lg" fullWidth onClick={handleBookNow}>
            <Calendar size={20} className="mr-2" />
            Book Now
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" onClick={handleContact}>
            <MessageSquare size={20} className="mr-2" />
            Contact
          </Button>
        </div>
      </div>

      {/* Specialties */}
      {providerData?.specialties && providerData.specialties.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Specialties</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {providerData.specialties.map((specialty) => (
              <span
                key={specialty}
                className="px-3 py-1.5 rounded-full bg-section-gradient/10 text-section-primary text-sm font-medium border border-section-primary/20"
              >
                {specialty}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Services & Pricing */}
      {providerData?.servicePricing && providerData.servicePricing.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Services</h2>
          </div>
          <div className="space-y-3">
            {providerData.servicePricing
              .filter((service) => service.isActive)
              .map((service) => (
                <div
                  key={service.id}
                  className="p-4 rounded-xl bg-background-secondary/5 border border-white/5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-text-inverse">{service.serviceName}</h3>
                      {service.description && (
                        <p className="text-sm text-text-secondary mt-1">{service.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-sm text-text-tertiary">
                          <Clock size={14} />
                          {service.durationMinutes} min
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-section-primary">
                        {formatPrice(service.price)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Portfolio / Gallery */}
      {portfolioImages.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Portfolio</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {portfolioImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedImage(image)}
                className="aspect-square rounded-xl overflow-hidden bg-background-secondary/10"
              >
                <img
                  src={image}
                  alt={`Portfolio ${index + 1}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {providerData?.certifications && providerData.certifications.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Award size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Certifications</h2>
          </div>
          <div className="space-y-3">
            {providerData.certifications.map((cert) => (
              <div
                key={cert.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-background-secondary/5 border border-white/5"
              >
                <div className="w-10 h-10 rounded-lg bg-section-gradient/10 flex items-center justify-center flex-shrink-0">
                  <Award size={18} className="text-section-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-inverse text-sm">{cert.name}</h3>
                  <p className="text-xs text-text-secondary">{cert.issuingOrganization}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-text-tertiary">
                      Issued: {formatDate(cert.issueDate)}
                    </span>
                    {cert.isVerified && (
                      <span className="flex items-center gap-0.5 text-xs text-success-DEFAULT">
                        <Check size={10} />
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {providerData?.education && providerData.education.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Education</h2>
          </div>
          <div className="space-y-3">
            {providerData.education.map((edu) => (
              <div
                key={edu.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-background-secondary/5 border border-white/5"
              >
                <div className="w-10 h-10 rounded-lg bg-section-gradient/10 flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={18} className="text-section-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-inverse text-sm">{edu.institution}</h3>
                  <p className="text-xs text-text-secondary">
                    {edu.degree} in {edu.fieldOfStudy}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {formatDate(edu.startDate)} - {edu.isOngoing ? 'Present' : formatDate(edu.endDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {providerData?.languages && providerData.languages.length > 0 && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Languages size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Languages</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {providerData.languages.map((language) => (
              <span
                key={language}
                className="px-3 py-1.5 rounded-full bg-background-secondary/20 text-text-secondary text-sm"
              >
                {language}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* License Information */}
      {providerData?.licenseNumber && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-section-primary" />
            <h2 className="font-semibold text-text-inverse">Professional License</h2>
          </div>
          <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/5">
            <p className="text-sm text-text-secondary">License Number</p>
            <p className="font-mono text-text-inverse mt-1">{providerData.licenseNumber}</p>
            {providerData.isVerified && (
              <div className="flex items-center gap-1 mt-2 text-success-DEFAULT text-sm">
                <Check size={14} />
                <span>Verified by VFit</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancellation Policy */}
      {providerData?.cancellationPolicy && (
        <div className="px-4 py-4 border-t border-white/5">
          <h2 className="font-semibold text-text-inverse mb-2">Cancellation Policy</h2>
          <p className="text-sm text-text-secondary">{providerData.cancellationPolicy}</p>
        </div>
      )}

      {/* Social Links */}
      {profile.socialLinks && Object.values(profile.socialLinks).some((v) => v) && (
        <div className="px-4 py-4 border-t border-white/5">
          <h2 className="font-semibold text-text-inverse mb-3">Connect</h2>
          <div className="flex flex-wrap gap-3">
            {profile.socialLinks.website && (
              <a
                href={profile.socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-secondary/10 text-text-secondary hover:bg-background-secondary/20 transition-colors"
              >
                <Globe size={16} />
                <span className="text-sm">Website</span>
              </a>
            )}
            {profile.socialLinks.instagram && (
              <a
                href={`https://instagram.com/${profile.socialLinks.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-secondary/10 text-text-secondary hover:bg-background-secondary/20 transition-colors"
              >
                <span className="text-sm font-semibold">Instagram</span>
              </a>
            )}
            {profile.socialLinks.linkedin && (
              <a
                href={profile.socialLinks.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-secondary/10 text-text-secondary hover:bg-background-secondary/20 transition-colors"
              >
                <span className="text-sm font-semibold">LinkedIn</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft size={24} className="rotate-90" />
          </button>
          <img
            src={selectedImage}
            alt="Portfolio"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
