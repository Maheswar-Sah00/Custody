"use client"

import * as React from "react"
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Lightweight toast system — no external toast dependency (the project ships
 * radix dialog/select/label but not radix-toast). Wrap the app once in
 * {@link ToastProvider}, then call {@link useToast} anywhere:
 *
 * ```tsx
 * const { toast } = useToast()
 * toast({ title: "AF-0062 → Under Maintenance", variant: "success" })
 * toast({ title: "Booking conflict", description: "Overlaps AF-0114", variant: "error" })
 * ```
 */

export type ToastVariant = "default" | "success" | "error" | "warning" | "info"

export interface ToastOptions {
  title: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  /** Auto-dismiss delay in ms. Defaults to 4000; pass 0 to keep it sticky. */
  duration?: number
}

interface ToastRecord extends Required<Omit<ToastOptions, "description">> {
  id: number
  description?: React.ReactNode
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const VARIANT_META: Record<
  ToastVariant,
  { icon: React.ReactNode; accent: string }
> = {
  default: { icon: <Info />, accent: "text-zinc-300" },
  success: { icon: <CheckCircle2 />, accent: "text-emerald-400" },
  error: { icon: <XCircle />, accent: "text-red-400" },
  warning: { icon: <TriangleAlert />, accent: "text-amber-400" },
  info: { icon: <Info />, accent: "text-blue-400" },
}

let nextId = 1

/** Wrap the app once; renders the toast viewport and provides `useToast`. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([])
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = nextId++
      const record: ToastRecord = {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? "default",
        duration: options.duration ?? 4000,
      }
      setToasts((current) => [...current, record])
      if (record.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), record.duration)
        )
      }
      return id
    },
    [dismiss]
  )

  React.useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const meta = VARIANT_META[t.variant]
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-2 fade-in"
            >
              <span className={cn("mt-0.5 shrink-0 [&_svg]:size-5", meta.accent)}>
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description ? (
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"
              >
                <X />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Access the toast dispatcher. Must be used under a {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>")
  }
  return context
}
