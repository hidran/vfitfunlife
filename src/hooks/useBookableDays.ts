import { useQuery } from '@tanstack/react-query';
import { getProviderAvailability } from '@/lib/firebookings';
import { daysToCheck, findBookableDays } from '@/lib/availability/bookableDays';

const STALE_1_MIN = 60 * 1000;

/**
 * For the booking calendar: which days of `month` have ≥1 free start for this provider and
 * service. Asks getProviderSlots per day — the same question, and the same answer, as the slot
 * list shown when a day is picked. Only runs signed in (the callable requires it); until it
 * has answered, or when it could not, the picker leaves days selectable.
 */
export function useBookableDays(
  providerId: string | undefined,
  serviceId: string | undefined,
  month: Date,
  enabled: boolean,
) {
  const monthKey = `${month.getFullYear()}-${month.getMonth() + 1}`;
  return useQuery({
    queryKey: ['bookable-days', providerId, serviceId, monthKey],
    queryFn: () =>
      findBookableDays(daysToCheck(month, new Date()), async (day) =>
        (await getProviderAvailability(providerId as string, serviceId as string, day)).length,
      ),
    enabled: enabled && !!providerId && !!serviceId,
    staleTime: STALE_1_MIN,
  });
}
