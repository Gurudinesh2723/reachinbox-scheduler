import { useState } from 'react';
import { useSearchEmails } from '../hooks/useEmails';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmailTable } from './EmailTable';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Pagination } from './Pagination';
import { SearchBar } from './SearchBar';
import { EmailStatus } from '../types/domain';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<EmailStatus | undefined>();
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query);

  const { data, isLoading, isFetching, isError } = useSearchEmails({ q: debouncedQuery, status, page });
  const hasCriteria = debouncedQuery.trim().length > 0 || Boolean(status);

  return (
    <div className="space-y-4">
      <SearchBar
        value={query}
        onChange={(v) => {
          setQuery(v);
          setPage(1);
        }}
        status={status}
        onStatusChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
      />

      {!hasCriteria && <EmptyState title="Search your emails" description="Search by recipient email or subject." />}

      {hasCriteria && isLoading && <LoadingState label="Searching..." />}
      {hasCriteria && isError && <ErrorState title="Search failed." description="Please try again shortly." />}
      {hasCriteria && !isLoading && !isError && data && data.items.length === 0 && (
        <EmptyState title="No results found." description="Try a different email address or subject." />
      )}
      {hasCriteria && !isLoading && !isError && data && data.items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {isFetching && <p className="px-4 pt-3 text-xs text-slate-400">Refreshing...</p>}
          <EmailTable emails={data.items} timeColumnLabel="Scheduled time" timeAccessor={(e) => e.scheduledAt} />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
