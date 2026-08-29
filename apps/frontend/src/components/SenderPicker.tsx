import { FormEvent, useState } from 'react';
import { useCreateSender, useSenders } from '../hooks/useSenders';
import { normalizeApiError } from '../lib/axios';

interface SenderPickerProps {
  value: string;
  onChange: (senderId: string) => void;
}

/** Lets a user pick an existing sender or add a new one, so a single account can send from multiple senders (each with its own hourly rate-limit bucket). */
export function SenderPicker({ value, onChange }: SenderPickerProps) {
  const senders = useSenders();
  const createSender = useCreateSender();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const sender = await createSender.mutateAsync({ email, displayName });
      onChange(sender.id);
      setAdding(false);
      setEmail('');
      setDisplayName('');
    } catch (err) {
      setError(normalizeApiError(err).message);
    }
  }

  if (adding) {
    return (
      <form onSubmit={handleAdd} className="space-y-2 rounded-md border border-slate-200 p-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sender@company.com"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createSender.isPending}
            className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {createSender.isPending ? 'Adding...' : 'Add sender'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Default sender</option>
        {senders.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName} &lt;{s.email}&gt;
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
      >
        + Add sender
      </button>
    </div>
  );
}
