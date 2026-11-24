import { create } from 'zustand';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  severity: ToastSeverity;
  title?: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id: ++seq }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string, title?: string) => useToastStore.getState().push({ severity: 'success', message, title }),
  error: (message: string, title?: string) => useToastStore.getState().push({ severity: 'error', message, title }),
  info: (message: string, title?: string) => useToastStore.getState().push({ severity: 'info', message, title }),
  warning: (message: string, title?: string) => useToastStore.getState().push({ severity: 'warning', message, title }),
};
