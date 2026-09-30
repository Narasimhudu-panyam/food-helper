"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (options: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      title,
      message,
      variant = "info",
      duration = 4000,
    }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, title, message, variant, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string) =>
      showToast({ message, title, variant: "success" }),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string) =>
      showToast({ message, title, variant: "error" }),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string) =>
      showToast({ message, title, variant: "warning" }),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string) =>
      showToast({ message, title, variant: "info" }),
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        removeToast,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex max-h-screen w-full max-w-sm flex-col space-y-2.5 p-4 sm:p-0 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const variantIcons = {
    info: <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />,
    success: <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />,
    error: <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />,
  };

  const variantBorder = {
    info: "border-sky-200 bg-white",
    success: "border-emerald-200 bg-white",
    warning: "border-amber-200 bg-white",
    error: "border-rose-200 bg-white",
  };

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full items-start justify-between rounded-xl border p-3.5 shadow-lg transition-all animate-in slide-in-from-bottom-2",
        variantBorder[toast.variant]
      )}
    >
      <div className="flex items-start space-x-2.5">
        {variantIcons[toast.variant]}
        <div className="space-y-0.5 pr-2">
          {toast.title && (
            <h5 className="text-xs font-semibold text-zinc-900 leading-tight">
              {toast.title}
            </h5>
          )}
          <p className="text-xs text-zinc-600 leading-normal">{toast.message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        aria-label="Close notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
