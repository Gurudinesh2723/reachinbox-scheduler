import { EmailStatus } from '../types/domain';

const STYLES: Record<EmailStatus, string> = {
  scheduled: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

const LABELS: Record<EmailStatus, string> = {
  scheduled: 'Scheduled',
  processing: 'Processing',
  sent: 'Sent',
  failed: 'Failed',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
