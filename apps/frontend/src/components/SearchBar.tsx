import { EmailStatus } from '../types/domain';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  status?: EmailStatus;
  onStatusChange: (status?: EmailStatus) => void;
}

const STATUS_OPTIONS: EmailStatus[] = ['scheduled', 'processing', 'sent', 'failed'];

export function SearchBar({ value, onChange, status, onStatusChange }: SearchBarProps) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by recipient or subject..."
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        value={status ?? ''}
        onChange={(e) => onStatusChange((e.target.value || undefined) as EmailStatus | undefined)}
        className="rounded-md border border-slate-300 px-2 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
