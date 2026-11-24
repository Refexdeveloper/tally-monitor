import { get, post } from './client';
import type { DashboardActivity, DashboardAnalytics, DashboardOverview, IntegrationHealth, SessionResponse, UserProfile } from './types';

/** Minutes east of UTC, so the API buckets days in the user's local calendar. */
const tzOffset = () => -new Date().getTimezoneOffset();

export const authApi = {
  login: (body: { email: string; password: string; rememberMe: boolean }) => post<SessionResponse>('/auth/login', body),
  logout: () => post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => get<UserProfile>('/auth/me'),
  forgotPassword: (email: string) => post<{ message: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<{ message: string }>('/auth/reset-password', { token, password }),
};

export const dashboardApi = {
  overview: () => get<DashboardOverview>('/dashboard/overview', { tzOffset: tzOffset() }),
  analytics: (days: number) => get<DashboardAnalytics>('/dashboard/analytics', { days, tzOffset: tzOffset() }),
  activity: () => get<DashboardActivity>('/dashboard/activity'),
  health: () => get<IntegrationHealth>('/dashboard/health'),
};
