import { api } from '../lib/axios';
import { ApiSuccess } from '../types/api';
import { SlackStatus } from '../types/domain';

export async function fetchSlackStatus(): Promise<SlackStatus> {
  const res = await api.get<ApiSuccess<SlackStatus>>('/api/slack/status');
  return res.data.data;
}

export function slackConnectUrl(): string {
  return `${import.meta.env.VITE_API_URL}/api/slack/connect`;
}

export async function disconnectSlack(): Promise<void> {
  await api.post('/api/slack/disconnect');
}
