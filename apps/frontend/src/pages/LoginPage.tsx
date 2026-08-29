import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { googleLoginUrl } from '../services/authService';

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);

  const authError = searchParams.get('error');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            R
          </div>
          <h1 className="text-xl font-semibold text-slate-800">ReachInbox</h1>
          <p className="text-sm text-slate-500">AI-powered cold outreach, made simple.</p>
        </div>

        {authError && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Google login failed. Please try again.
          </div>
        )}

        <button
          onClick={() => {
            setRedirecting(true);
            window.location.href = googleLoginUrl();
          }}
          disabled={isLoading || redirecting}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {redirecting ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>

        <p className="mt-6 text-center text-xs text-slate-400">
          By continuing you agree to ReachInbox's terms of service.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.997 8.997 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.7V4.97H.96A8.997 8.997 0 0 0 0 9c0 1.45.35 2.83.96 4.03l3.01-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A8.997 8.997 0 0 0 .96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
