import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiRequestError } from '@/api/client';
import { App } from './App';
import { AppThemeProvider } from './theme/AppThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // Auth and permission failures are not transient; don't hammer the API.
      retry: (count, err) => !(err instanceof ApiRequestError && [401, 403, 404, 422].includes(err.status)) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
