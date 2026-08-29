export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface Sender {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
}

export interface Email {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  sender?: { email: string; displayName: string };
}

export interface Campaign {
  id: string;
  subject: string;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  createdAt: string;
  sender: { email: string; displayName: string };
  _count?: { emails: number };
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  senderId?: string;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  campaignId: string;
  totalScheduled: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
}

export interface ParsedRecipients {
  validEmails: string[];
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  totalLines: number;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
}
