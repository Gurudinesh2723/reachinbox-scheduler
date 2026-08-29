import { useState } from 'react';
import { User, SlackStatus } from '../types/domain';
import { slackConnectUrl } from '../services/slackService';
import { useDisconnectSlack } from '../hooks/useSlack';
import { useToast } from '../hooks/useToast';

interface HeaderProps {
  user: User;
  slackStatus?: SlackStatus;
  onLogout: () => void;
}

export function Header({ user, slackStatus, onLogout }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const disconnectSlack = useDisconnectSlack();
  const { showToast } = useToast();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          R
        </div>
        <span className="text-lg font-semibold text-slate-800">ReachInbox</span>
      </div>

      <div className="flex items-center gap-4">
        <SlackConnection
          status={slackStatus}
          onDisconnect={async () => {
            try {
              await disconnectSlack.mutateAsync();
              showToast('Slack disconnected', 'success');
            } catch {
              showToast('Slack connection failed', 'error');
            }
          }}
        />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium text-slate-700">{user.name}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <button
                onClick={onLogout}
                className="mt-3 w-full rounded-md border border-slate-200 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SlackConnection({ status, onDisconnect }: { status?: SlackStatus; onDisconnect: () => void }) {
  if (!status) return null;

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Slack connected{status.teamName ? ` (${status.teamName})` : ''}
        <button onClick={onDisconnect} className="ml-1 text-emerald-600 underline hover:text-emerald-800">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <a
      href={slackConnectUrl()}
      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      Connect Slack
    </a>
  );
}
