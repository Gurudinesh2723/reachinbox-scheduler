import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { ScheduledEmailsPanel } from '../components/ScheduledEmailsPanel';
import { SentEmailsPanel } from '../components/SentEmailsPanel';
import { SearchPanel } from '../components/SearchPanel';
import { useAuth } from '../hooks/useAuth';
import { useSlackStatus } from '../hooks/useSlack';
import { useToast } from '../hooks/useToast';

type Tab = 'scheduled' | 'sent' | 'search';

const TABS: { key: Tab; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled Emails' },
  { key: 'sent', label: 'Sent Emails' },
  { key: 'search', label: 'Search' },
];

export function DashboardPage() {
  const { user, logout } = useAuth();
  const slackStatus = useSlackStatus();
  const [tab, setTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    if (searchParams.get('slack_connected')) {
      showToast('Slack connected successfully', 'success');
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('slack_error')) {
      showToast('Slack connection failed', 'error');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} slackStatus={slackStatus.data} onLogout={() => logout()} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <nav className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setComposeOpen(true)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Compose new email
          </button>
        </div>

        {tab === 'scheduled' && <ScheduledEmailsPanel />}
        {tab === 'sent' && <SentEmailsPanel />}
        {tab === 'search' && <SearchPanel />}
      </main>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}
    </div>
  );
}
