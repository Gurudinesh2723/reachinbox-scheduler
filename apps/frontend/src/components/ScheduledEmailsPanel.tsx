import { useState } from 'react';
import { useScheduledEmails } from '../hooks/useEmails';
import { EmailTable } from './EmailTable';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Pagination } from './Pagination';

export function ScheduledEmailsPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useScheduledEmails(page);

  if (isLoading) return <LoadingState label="Loading scheduled emails..." />;
  if (isError) return <ErrorState title="Failed to load emails." description="Please try again shortly." />;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No scheduled emails yet." description="Compose a new email to get started." />;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <EmailTable emails={data.items} timeColumnLabel="Scheduled time" timeAccessor={(e) => e.scheduledAt} />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
    </div>
  );
}
