import { Email } from '../types/domain';
import { StatusBadge } from './StatusBadge';

interface EmailTableProps {
  emails: Email[];
  timeColumnLabel: string;
  timeAccessor: (email: Email) => string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function EmailTable({ emails, timeColumnLabel, timeAccessor }: EmailTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-auto text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Subject</th>
            <th className="px-4 py-3 font-medium">{timeColumnLabel}</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {emails.map((email) => (
            <tr key={email.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-800">{email.recipient}</td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-600">{email.subject}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(timeAccessor(email))}</td>
              <td className="px-4 py-3">
                <StatusBadge status={email.status} />
                {email.status === 'failed' && email.errorMessage && (
                  <p className="mt-1 max-w-xs truncate text-xs text-red-500" title={email.errorMessage}>
                    {email.errorMessage}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
