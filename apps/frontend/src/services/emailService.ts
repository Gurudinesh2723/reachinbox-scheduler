import { api } from '../lib/axios';
import { ApiSuccess, Paginated } from '../types/api';
import { Email, EmailStatus, ParsedRecipients, ScheduleRequest, ScheduleResponse } from '../types/domain';

export async function parseRecipientsFile(file: File): Promise<ParsedRecipients> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<ApiSuccess<ParsedRecipients>>('/api/emails/parse-recipients', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function scheduleEmails(payload: ScheduleRequest): Promise<ScheduleResponse> {
  const res = await api.post<ApiSuccess<ScheduleResponse>>('/api/emails/schedule', payload);
  return res.data.data;
}

export async function fetchScheduledEmails(page: number, pageSize = 20): Promise<Paginated<Email>> {
  const res = await api.get<ApiSuccess<Paginated<Email>>>('/api/emails/scheduled', { params: { page, pageSize } });
  return res.data.data;
}

export async function fetchSentEmails(page: number, pageSize = 20): Promise<Paginated<Email>> {
  const res = await api.get<ApiSuccess<Paginated<Email>>>('/api/emails/sent', { params: { page, pageSize } });
  return res.data.data;
}

export async function searchEmails(params: {
  q?: string;
  status?: EmailStatus;
  page: number;
  pageSize?: number;
}): Promise<Paginated<Email>> {
  const res = await api.get<ApiSuccess<Paginated<Email>>>('/api/emails/search', { params });
  return res.data.data;
}
