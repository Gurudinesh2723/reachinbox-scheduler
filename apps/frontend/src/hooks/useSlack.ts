import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectSlack, fetchSlackStatus } from '../services/slackService';

export function useSlackStatus() {
  return useQuery({ queryKey: ['slack', 'status'], queryFn: fetchSlackStatus });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slack', 'status'] }),
  });
}
