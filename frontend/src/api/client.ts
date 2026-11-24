import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';
import type { ApiEnvelope, ApiErrorBody, SessionResponse } from './types';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const http = axios.create({ baseURL, withCredentials: true, timeout: 30_000 });

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export const hasSessionHint = () => readCookie('tm_csrf') !== null;

function csrfHeaders() {
  const token = readCookie('tm_csrf');
  return token ? { 'X-CSRF-Token': token } : {};
}

export function toApiError(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err;
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error) return new ApiRequestError(body.error.message, err.response!.status, body.error.code, body.error.details);
    if (err.code === 'ECONNABORTED') return new ApiRequestError('The server took too long to respond.', 0, 'TIMEOUT');
    if (!err.response) return new ApiRequestError('Cannot reach the Tally Monitor API. Check your connection.', 0, 'NETWORK_ERROR');
    return new ApiRequestError(`Request failed (${err.response.status})`, err.response.status, 'HTTP_ERROR');
  }
  return new ApiRequestError('Unexpected error', 0, 'UNKNOWN');
}

let refreshing: Promise<SessionResponse> | null = null;

async function doRefresh(retryOnRace = true): Promise<SessionResponse> {
  try {
    const res = await axios.post<ApiEnvelope<SessionResponse>>(`${baseURL}/auth/refresh`, null, { withCredentials: true, headers: csrfHeaders() });
    return res.data.data;
  } catch (err) {
    const apiErr = toApiError(err);
    // Another tab rotated the token a moment ago; its new cookie is now in place.
    if (apiErr.code === 'REFRESH_RACE' && retryOnRace) {
      await new Promise((r) => setTimeout(r, 400));
      return doRefresh(false);
    }
    throw apiErr;
  }
}

/** Single-flight refresh shared by all concurrent requests. */
export function refreshSession(): Promise<SessionResponse> {
  refreshing ??= doRefresh()
    .then((session) => {
      useAuthStore.getState().setSession(session.accessToken, session.user);
      return session;
    })
    .catch((err) => {
      useAuthStore.getState().clear();
      throw err;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  if (config.url?.startsWith('/auth/')) Object.entries(csrfHeaders()).forEach(([k, v]) => config.headers.set(k, v));
  return config;
});

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthCall = config?.url?.startsWith('/auth/') ?? false;
  if (error.response?.status === 401 && config && !config._retried && !isAuthCall) {
    config._retried = true;
    try {
      await refreshSession();
      return http(config);
    } catch {
      // fall through to the original error; the store is now anonymous
    }
  }
  throw toApiError(error);
});

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await http.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<ApiEnvelope<T>>(url, body);
  return res.data.data;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<ApiEnvelope<T>>(url, body);
  return res.data.data;
}

export async function del<T>(url: string): Promise<T> {
  const res = await http.delete<ApiEnvelope<T>>(url);
  return res.data.data;
}

/** GET returning both data and pagination meta. */
export async function getPage<T>(url: string, params?: Record<string, unknown>): Promise<{ items: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'));
  const res = await http.get<ApiEnvelope<T[]>>(url, { params: clean });
  return { items: res.data.data, meta: res.data.meta as { page: number; pageSize: number; total: number; totalPages: number } };
}
