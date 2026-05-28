'use client';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { recordAudit, type AuditPayload } from './auditLog';

interface Options<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  audit: (input: TInput, result: TResult) => AuditPayload;
  invalidateKeys?: QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void;
}

export function useEntityMutation<TInput, TResult = void>(opts: Options<TInput, TResult>) {
  const qc = useQueryClient();
  const actor = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: opts.mutate,
    onSuccess: async (result, input) => {
      await recordAudit(actor, opts.audit(input, result));
      opts.invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(result, input);
    },
  });
}
