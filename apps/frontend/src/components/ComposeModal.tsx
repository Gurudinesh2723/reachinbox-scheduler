import { FormEvent, useState } from 'react';
import { LeadListUpload } from './LeadListUpload';
import { SenderPicker } from './SenderPicker';
import { useScheduleEmails } from '../hooks/useEmails';
import { useSchedulingDefaults } from '../hooks/useConfig';
import { useToast } from '../hooks/useToast';
import { normalizeApiError } from '../lib/axios';
import { ParsedRecipients } from '../types/domain';

interface ComposeModalProps {
  onClose: () => void;
}

function defaultStartTime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ComposeModal({ onClose }: ComposeModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senderId, setSenderId] = useState<string>('');
  const [startTime, setStartTime] = useState(defaultStartTime());
  // null = "not yet touched by the user" - falls back to the server's
  // configured MIN_EMAIL_DELAY/MAX_EMAILS_PER_HOUR once loaded, rather than
  // a value hardcoded in the frontend.
  const [delayBetweenEmails, setDelayBetweenEmails] = useState<number | null>(null);
  const [hourlyLimit, setHourlyLimit] = useState<number | null>(null);
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const schedulingDefaults = useSchedulingDefaults();
  const scheduleEmails = useScheduleEmails();
  const { showToast } = useToast();

  const effectiveDelay = delayBetweenEmails ?? schedulingDefaults.data?.minEmailDelay ?? 2;
  const effectiveHourlyLimit = hourlyLimit ?? schedulingDefaults.data?.maxEmailsPerHour ?? 100;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!subject.trim() || !body.trim()) {
      setFormError('Subject and body are required.');
      return;
    }
    if (!parsed || parsed.validEmails.length === 0) {
      setFormError('Upload a CSV/TXT file with at least one valid recipient.');
      return;
    }

    try {
      const result = await scheduleEmails.mutateAsync({
        subject,
        body,
        recipients: parsed.validEmails,
        senderId: senderId || undefined,
        startTime: new Date(startTime).toISOString(),
        delayBetweenEmails: effectiveDelay,
        hourlyLimit: effectiveHourlyLimit,
      });
      showToast(`${result.totalScheduled} email(s) scheduled successfully`, 'success');
      onClose();
    } catch (err) {
      const { message } = normalizeApiError(err);
      setFormError(message);
      showToast('Failed to schedule emails', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Compose new email</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">From sender</label>
            <SenderPicker value={senderId} onChange={setSenderId} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Quick question about your workflow"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Hi {{name}}, ..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Upload recipients (CSV or TXT)</label>
            <LeadListUpload onParsed={setParsed} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Start time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Delay (sec)</label>
              <input
                type="number"
                min={0}
                value={effectiveDelay}
                onChange={(e) => setDelayBetweenEmails(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Hourly limit</label>
              <input
                type="number"
                min={1}
                value={effectiveHourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduleEmails.isPending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {scheduleEmails.isPending ? 'Scheduling...' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
