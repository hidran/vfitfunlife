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
