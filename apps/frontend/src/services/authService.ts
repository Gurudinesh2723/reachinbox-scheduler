import { api } from '../lib/axios';
import { ApiSuccess } from '../types/api';
import { User } from '../types/domain';

export async function fetchCurrentUser(): Promise<User> {
  const res = await api.get<ApiSuccess<User>>('/api/auth/me');
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout');
}

export function googleLoginUrl(): string {
  return `${import.meta.env.VITE_API_URL}/api/auth/google`;
}
