import { useRef, useState } from 'react';
import { useParseRecipients } from '../hooks/useEmails';
import { normalizeApiError } from '../lib/axios';
import { ParsedRecipients } from '../types/domain';

interface LeadListUploadProps {
  onParsed: (result: ParsedRecipients | null) => void;
}

export function LeadListUpload({ onParsed }: LeadListUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parseRecipients = useParseRecipients();

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    onParsed(null);

    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('Only .csv or .txt files are supported.');
      return;
    }

    try {
      const result = await parseRecipients.mutateAsync(file);
      onParsed(result);
    } catch (err) {
      setError(normalizeApiError(err).message);
    }
  }

  return (
    <div>
      <div
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-brand-400"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <p className="text-sm font-medium text-slate-700">
          {fileName ?? 'Click to upload or drag a .csv / .txt file'}
        </p>
        <p className="text-xs text-slate-500">One email per line, or a CSV with email in the first column</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {parseRecipients.isPending && <p className="mt-2 text-sm text-slate-500">Parsing file...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {parseRecipients.data && (
        <p className="mt-2 text-sm font-medium text-emerald-700">
          {parseRecipients.data.validCount} email address{parseRecipients.data.validCount === 1 ? '' : 'es'} detected
          {parseRecipients.data.duplicateCount > 0 && ` (${parseRecipients.data.duplicateCount} duplicates removed)`}
          {parseRecipients.data.invalidCount > 0 && ` (${parseRecipients.data.invalidCount} invalid ignored)`}
        </p>
      )}
    </div>
  );
}
