import { useQuery } from '@tanstack/react-query';
import { fetchSenders } from '../services/senderService';

export function useSenders() {
  return useQuery({ queryKey: ['senders'], queryFn: fetchSenders });
}
