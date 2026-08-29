import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './hooks/useToast';
import { ToastViewport } from './components/ToastViewport';
import { AppRouter } from './router/AppRouter';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  );
}
