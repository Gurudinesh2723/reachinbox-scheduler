import { useState } from 'react';
import { useSentEmails } from '../hooks/useEmails';
import { EmailTable } from './EmailTable';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Pagination } from './Pagination';

export function SentEmailsPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useSentEmails(page);

  if (isLoading) return <LoadingState label="Loading sent emails..." />;
  if (isError) return <ErrorState title="Failed to load emails." description="Please try again shortly." />;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No sent emails yet." description="Sent and failed emails will appear here." />;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <EmailTable emails={data.items} timeColumnLabel="Sent time" timeAccessor={(e) => e.sentAt ?? e.failedAt} />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
    </div>
  );
}
