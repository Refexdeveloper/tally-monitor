import { Box, Skeleton } from '@mui/material';
import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { ToastHost } from '@/components/common/ToastHost';
import { AppShell } from '@/components/layout/AppShell';
import { CURRENT_PHASE, NAV_ITEMS, type NavItem } from '@/config/navigation';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { AuthBootstrap, GuestOnly, RequireAuth } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { ModulePage } from '@/features/modules/ModulePage';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from '@/features/modules/StatusPages';
import { useAuthStore } from '@/stores/auth';

const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => loader().then((m) => ({ default: m[name] })));

const PAGES: Partial<Record<string, LazyExoticComponent<ComponentType>>> = {
  dashboard: page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
  applications: page(() => import('@/features/applications/ApplicationsPage'), 'ApplicationsPage'),
  companies: page(() => import('@/features/companies/CompaniesPage'), 'CompaniesPage'),
  tally: page(() => import('@/features/tally/TallyConnectionsPage'), 'TallyConnectionsPage'),
  users: page(() => import('@/features/users/UsersPage'), 'UsersPage'),
  expenses: page(() => import('@/features/expenses/ExpensesPage'), 'ExpensesPage'),
  ledgers: page(() => import('@/features/ledgers/LedgersPage'), 'LedgersPage'),
  queue: page(() => import('@/features/queue/QueuePage'), 'QueuePage'),
  audit: page(() => import('@/features/audit/AuditLogsPage'), 'AuditLogsPage'),
  vouchers: page(() => import('@/features/vouchers/VouchersPage'), 'VouchersPage'),
  settings: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
  reports: page(() => import('@/features/reports/ReportsPage'), 'ReportsPage'),
};
const ApplicationDetailPage = page(() => import('@/features/applications/ApplicationDetailPage'), 'ApplicationDetailPage');
const CompanyDetailPage = page(() => import('@/features/companies/CompanyDetailPage'), 'CompanyDetailPage');
const ExpenseDetailPage = page(() => import('@/features/expenses/ExpenseDetailPage'), 'ExpenseDetailPage');
const JobDetailPage = page(() => import('@/features/queue/JobDetailPage'), 'JobDetailPage');

function PageFallback() {
  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.7fr 1fr' } }} aria-busy>
      <Skeleton variant="rounded" height={260} sx={{ borderRadius: 5 }} />
      <Skeleton variant="rounded" height={260} sx={{ borderRadius: 5 }} />
    </Box>
  );
}

function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const allowed = useAuthStore((s) => s.hasPermission(permission));
  return allowed ? <>{children}</> : <ForbiddenPage />;
}

function guarded(permission: string, Page: ComponentType) {
  return (
    <RequirePermission permission={permission}>
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    </RequirePermission>
  );
}

function moduleRoute(item: NavItem): RouteObject {
  const Page = PAGES[item.key];
  const element = Page && item.phase <= CURRENT_PHASE ? guarded(item.permission, Page) : <RequirePermission permission={item.permission}><ModulePage item={item} /></RequirePermission>;
  return item.path === '/' ? { index: true, element } : { path: item.path.slice(1), element };
}

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    element: (
      <AuthBootstrap>
        <Outlet />
        <ToastHost />
      </AuthBootstrap>
    ),
    children: [
      { path: '/login', element: <GuestOnly><LoginPage /></GuestOnly> },
      { path: '/forgot-password', element: <GuestOnly><ForgotPasswordPage /></GuestOnly> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          ...NAV_ITEMS.map(moduleRoute),
          { path: 'applications/:id', element: guarded('applications.view', ApplicationDetailPage) },
          { path: 'companies/:id', element: guarded('companies.view', CompanyDetailPage) },
          { path: 'expenses/:id', element: guarded('expenses.view', ExpenseDetailPage) },
          { path: 'queue/:id', element: guarded('jobs.view', JobDetailPage) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
