import { api } from '../lib/axios';
import { ApiSuccess } from '../types/api';

export interface SchedulingDefaults {
  minEmailDelay: number;
  maxEmailsPerHour: number;
  workerConcurrency: number;
}

export async function fetchSchedulingDefaults(): Promise<SchedulingDefaults> {
  const res = await api.get<ApiSuccess<SchedulingDefaults>>('/api/config/defaults');
  return res.data.data;
}
