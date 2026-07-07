"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const VARIANT_ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: "text-[var(--color-success)]",
  error: "text-[var(--color-danger)]",
  info: "text-[var(--color-primary)]",
};

const AUTO_DISMISS_MS = 5000;

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  const Icon = VARIANT_ICON[item.variant];
  // Errors are assertive (role=alert); success/info are polite (role=status).
  const role = item.variant === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 pr-2.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.3)]",
        "animate-[fade-up_0.24s_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-4 shrink-0", VARIANT_ACCENT[item.variant])}
      />
      <p className="flex-1 text-sm text-[var(--color-foreground)]">
        {item.message}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] outline-offset-2 hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), message, variant },
      ]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
            {items.map((item) => (
              <ToastCard
                key={item.id}
                item={item}
                onClose={() => remove(item.id)}
              />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
