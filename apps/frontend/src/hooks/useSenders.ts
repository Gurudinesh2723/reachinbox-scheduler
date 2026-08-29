import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSender, fetchSenders } from '../services/senderService';

export function useSenders() {
  return useQuery({ queryKey: ['senders'], queryFn: fetchSenders });
}

export function useCreateSender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSender,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['senders'] }),
  });
}
