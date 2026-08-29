import { useToast } from '../hooks/useToast';

const VARIANT_STYLES: Record<string, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
};

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`min-w-[260px] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[toast.variant]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/70 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
