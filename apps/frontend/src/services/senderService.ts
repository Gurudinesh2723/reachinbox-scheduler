import { api } from '../lib/axios';
import { ApiSuccess } from '../types/api';
import { Sender } from '../types/domain';

export async function fetchSenders(): Promise<Sender[]> {
  const res = await api.get<ApiSuccess<Sender[]>>('/api/senders');
  return res.data.data;
}
