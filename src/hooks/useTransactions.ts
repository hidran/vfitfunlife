import { useQuery } from '@tanstack/react-query';
import { fetchTransactions } from '@/lib/firebase/transactions';

export function useTransactions(opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['transactions', opts],
    queryFn: () => fetchTransactions(opts),
    staleTime: 5 * 60 * 1000,
  });
}
