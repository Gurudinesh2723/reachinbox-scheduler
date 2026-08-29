import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

export interface NormalizedApiError {
  code: string;
  message: string;
}

export function normalizeApiError(err: unknown): NormalizedApiError {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: { code?: string; message?: string } } | undefined;
    if (body?.error) {
      return { code: body.error.code ?? 'UNKNOWN', message: body.error.message ?? 'Something went wrong' };
    }
    if (err.code === 'ERR_NETWORK') {
      return { code: 'NETWORK_ERROR', message: 'Could not reach the server. Is the backend running?' };
    }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong' };
}
