import type { Timestamp } from 'firebase/firestore';
import type { Booking } from '@/types/booking';

export type BookingSection = 'fit' | 'fun' | 'life';

interface SectionMeta {
  id: BookingSection;
  label: string;
  color: string;
  softColor: string;
}

const SECTION_META: Record<BookingSection, SectionMeta> = {
  fit: {
    id: 'fit',
    label: 'VFit',
    color: '#00C9FF',
    softColor: 'rgba(0, 201, 255, 0.2)',
  },
  fun: {
    id: 'fun',
    label: 'VFun',
    color: '#B461FF',
    softColor: 'rgba(180, 97, 255, 0.2)',
  },
  life: {
    id: 'life',
    label: 'VLife',
    color: '#00E676',
    softColor: 'rgba(0, 230, 118, 0.2)',
  },
};

const LIFE_KEYWORDS = [
  'massage',
  'massaggio',
  'osteo',
  'fisi',
  'mental',
  'psico',
  'estet',
  'nail',
  'spa',
  'wellness',
  'beauty',
];

const FUN_KEYWORDS = [
  'party',
  'evento',
  'event',
  'vr',
  'tv',
  'stream',
  'game',
  'show',
];

function toTimestampLike(date: Date): Timestamp {
  return {
    toDate: () => date,
  } as unknown as Timestamp;
}

export function inferBookingSection(serviceName?: string | null): BookingSection {
  const normalized = (serviceName ?? '').toLowerCase();

  if (LIFE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'life';
  }

  if (FUN_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'fun';
  }

  return 'fit';
}

export function getBookingSectionMeta(serviceName?: string | null): SectionMeta {
  const section = inferBookingSection(serviceName);
  return SECTION_META[section];
}

export function buildFallbackBooking(bookingId: string): Booking {
  const now = Date.now();
  const scheduled = new Date(now + 1000 * 60 * 60 * 24 * 2);
  const scheduledEnd = new Date(scheduled.getTime() + 60 * 60 * 1000);

  return {
    id: bookingId,
    userId: 'demo-user',
    providerId: 'demo-provider',
    serviceId: 'demo-service',
    serviceName: 'Sessione Personal Training',
    providerName: 'Coach Demo',
    providerAvatar: '/images/placeholder.jpg',
    scheduledAt: toTimestampLike(scheduled),
    scheduledEndAt: toTimestampLike(scheduledEnd),
    duration: 60,
    locationType: 'in_person',
    location: {
      address: 'Via Roma 123, Milano',
      lat: 45.4642,
      lng: 9.19,
    },
    servicePrice: 60,
    platformFee: 3,
    discountAmount: 0,
    pointsUsed: 0,
    pointsValue: 0,
    totalPrice: 63,
    status: 'accepted',
    paymentStatus: 'paid',
    hasReviewed: false,
    createdAt: toTimestampLike(new Date(now - 1000 * 60 * 60 * 6)),
    updatedAt: toTimestampLike(new Date(now - 1000 * 60 * 10)),
  };
}
