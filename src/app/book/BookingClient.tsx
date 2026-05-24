'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Star,
  Globe,
  Award,
  Clock,
  MessageCircle,
  ChevronRight,
  Shield,
  Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { ServiceCard, AvailabilityPicker } from '@/components/booking';
import type { Service } from '@/types/booking';
import { useProvider, useProviderServices } from '@/hooks/useProviders';
import { useInstructorReviews } from '@/hooks/useCommunity';
import { VenueNotFound } from '@/components/venue/VenueNotFound';

export default function ProviderBookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams?.get('providerId') ?? undefined;

  const {
    selectedService,
    selectedDate,
    selectedTime,
    availability,
    isLoadingAvailability,
    selectService,
    selectDateTime,
    fetchAvailability,
  } = useBookingStore();

  const { data: provider, isLoading: providerLoading } = useProvider(providerId);
  const { data: services = [] } = useProviderServices(providerId);
  const { data: reviews = [] } = useInstructorReviews(providerId);
  const [activeTab, setActiveTab] = useState<'services' | 'reviews' | 'about'>('services');

  // Fetch availability when date changes
  useEffect(() => {
    if (provider && selectedDate) {
      fetchAvailability(provider.id, selectedDate);
    }
  }, [provider, selectedDate, fetchAvailability]);

  const handleServiceSelect = (service: Service) => {
    selectService(service.id === selectedService?.id ? null : service);
  };

  const handleDateSelect = (date: Date) => {
    selectDateTime(date, null);
  };

  const handleTimeSelect = (time: string) => {
    if (selectedDate) {
      selectDateTime(selectedDate, time);
    }
  };

  const handleContinue = () => {
    if (selectedService && selectedDate && selectedTime) {
      router.push('/booking/confirm');
    }
  };

  const canContinue = selectedService && selectedDate && selectedTime;

  if (!providerId) {
    return <VenueNotFound message="Provider non specificato" />;
  }

  if (providerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }
  if (!provider) {
    return <VenueNotFound message="Provider non trovato" />;
  }

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-white/10">
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white truncate">
            {provider.fullName}
          </h1>
        </div>
      </div>

      {/* Provider Header */}
      <div className="p-4">
        <div className="flex gap-4">
          <Avatar
            src={provider.avatarUrl}
            alt={provider.fullName}
            size="xl"
            className="flex-shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-white">{provider.fullName}</h2>
              {provider.isVerified && (
                <Badge variant="partner" size="sm">
                  <Shield className="w-3 h-3 mr-1" />
                  Verificato
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-warning fill-warning" />
                <span className="font-semibold text-white">{provider.rating.toFixed(1)}</span>
              </div>
              <span className="text-text-secondary">
                ({provider.reviewCount} recensioni)
              </span>
            </div>

            <div className="flex items-center gap-3 mt-2 text-sm text-text-secondary">
              <span className="flex items-center gap-1">
                <Award className="w-4 h-4 text-[var(--section-primary)]" />
                {provider.yearsOfExperience} anni exp.
              </span>
              {provider.languages.length > 0 && (
                <span className="flex items-center gap-1">
                  <Globe className="w-4 h-4 text-[var(--section-primary)]" />
                  {provider.languages.join(', ')}
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Specialties */}
        <div className="flex flex-wrap gap-2 mt-4">
          {provider.specialties.map((specialty) => (
            <span
              key={specialty}
              className="bg-[var(--section-primary)]/10 text-[var(--section-primary)] px-3 py-1 rounded-full text-sm"
            >
              {specialty}
            </span>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <Button variant="outline" size="sm" className="flex-1">
            <MessageCircle className="w-4 h-4 mr-2" />
            Messaggio
          </Button>
          <Button variant="secondary" size="sm" className="flex-1">
            <Calendar className="w-4 h-4 mr-2" />
            Verifica disponibilità
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex">
          {[
            { id: 'services', label: 'Servizi' },
            { id: 'reviews', label: 'Recensioni' },
            { id: 'about', label: 'Chi sono' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-[var(--section-primary)]'
                  : 'text-text-secondary hover:text-white'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--section-primary)]"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'services' && (
            <motion.div
              key="services"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="font-semibold text-white mb-4">Seleziona un servizio</h3>
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={{ ...service, description: service.description ?? '' }}
                  isSelected={selectedService?.id === service.id}
                  onSelect={handleServiceSelect}
                />
              ))}

              {selectedService && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-6"
                >
                  <h3 className="font-semibold text-white mb-4">Seleziona data e orario</h3>
                  <AvailabilityPicker
                    availability={availability}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    onSelectDate={handleDateSelect}
                    onSelectTime={handleTimeSelect}
                    isLoading={isLoadingAvailability}
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'reviews' && (
            <motion.div
              key="reviews"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {reviews.map((review) => {
                const dateLabel = review.createdAt?.toDate
                  ? review.createdAt.toDate().toLocaleDateString('it-IT')
                  : 'Recente';
                return (
                  <div
                    key={review.id}
                    className="bg-[#2A2D3A]/50 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white">{review.userName}</span>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-warning fill-warning" />
                        <span className="text-white">{review.rating}</span>
                      </div>
                    </div>
                    <p className="text-text-secondary text-sm">{review.text}</p>
                    <p className="text-text-tertiary text-xs mt-2">{dateLabel}</p>
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-[#2A2D3A]/50 rounded-xl p-4">
                <h3 className="font-semibold text-white mb-2">Bio</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
              Personal trainer certificato CONI con 8 anni di esperienza. Specializzato in 
                  bodybuilding, nutrizione sportiva e riabilitazione post-infortunio. 
                  Aiuto i miei clienti a raggiungere i loro obiettivi attraverso programmi 
                  personalizzati e un approccio scientifico all&apos;allenamento.
                </p>
              </div>

              <div className="bg-[#2A2D3A]/50 rounded-xl p-4">
                <h3 className="font-semibold text-white mb-2">Formazione</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li className="flex items-start gap-2">
                    <Award className="w-4 h-4 text-[var(--section-primary)] mt-0.5" />
                    <span>Laurea in Scienze Motorie - Università degli Studi di Milano</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Award className="w-4 h-4 text-[var(--section-primary)] mt-0.5" />
                    <span>Certificazione CONI Personal Trainer Livello 2</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Award className="w-4 h-4 text-[var(--section-primary)] mt-0.5" />
                    <span>Specializzazione Nutrizione Sportiva - ISSA</span>
                  </li>
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Action Bar */}
      <AnimatePresence>
        {canContinue && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-[#2A2D3A] border-t border-white/10 p-4 safe-area-pb"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-text-secondary text-sm">
                  {selectedService?.name}
                </p>
                <p className="text-lg font-bold text-white">
                  {selectedDate?.toLocaleDateString('it-IT', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  &middot; {selectedTime}
                </p>
              </div>
              <Button
                onClick={handleContinue}
                className="flex-shrink-0"
              >
                Continua
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
