import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchScheduledEmails,
  fetchSentEmails,
  parseRecipientsFile,
  scheduleEmails,
  searchEmails,
} from '../services/emailService';
import { EmailStatus, ScheduleRequest } from '../types/domain';

export function useScheduledEmails(page: number) {
  return useQuery({
    queryKey: ['emails', 'scheduled', page],
    queryFn: () => fetchScheduledEmails(page),
    placeholderData: (prev) => prev,
  });
}

export function useSentEmails(page: number) {
  return useQuery({
    queryKey: ['emails', 'sent', page],
    queryFn: () => fetchSentEmails(page),
    placeholderData: (prev) => prev,
  });
}

export function useSearchEmails(params: { q: string; status?: EmailStatus; page: number }) {
  const enabled = params.q.trim().length > 0 || Boolean(params.status);
  return useQuery({
    queryKey: ['emails', 'search', params.q, params.status, params.page],
    queryFn: () => searchEmails(params),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useParseRecipients() {
  return useMutation({ mutationFn: parseRecipientsFile });
}

export function useScheduleEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScheduleRequest) => scheduleEmails(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', 'scheduled'] });
    },
  });
}
