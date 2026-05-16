"use client";
import { create } from "zustand";

export type ToastType = "info" | "success" | "error";

export type Toast = {
  id: number;
  title: string;
  body: string;
  type: ToastType;
  duration: number;
};

type S = {
  toasts: Toast[];
  push: (t: { title: string; body: string; type?: ToastType; duration?: number }) => void;
  dismiss: (id: number) => void;
};

export const useToasts = create<S>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    const type: ToastType = t.type ?? "info";
    const duration = t.duration ?? 6000;
    set((s) => ({ toasts: [...s.toasts, { title: t.title, body: t.body, id, type, duration }] }));
    setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
