"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export interface ModalProps {
  /** Controlled open state. Omit to run uncontrolled with `trigger`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element that opens the modal (uncontrolled usage). */
  trigger?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Body content — typically a form. */
  children: React.ReactNode
  /** Footer content — typically Cancel / Submit buttons. */
  footer?: React.ReactNode
  /** Extra classes for the dialog panel (e.g. a wider max-width). */
  className?: string
}

/**
 * Modal — a thin, opinionated wrapper over the shared Dialog primitive for the
 * common "titled panel with a form and footer actions" case used by register
 * and add flows (register asset, add department, …).
 *
 * @example
 * ```tsx
 * const [open, setOpen] = React.useState(false)
 * <Modal
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Register asset"
 *   description="Add a new item to the inventory."
 *   footer={
 *     <>
 *       <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button onClick={submit}>Save</Button>
 *     </>
 *   }
 * >
 *   <RegisterAssetForm />
 * </Modal>
 * ```
 */
function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn("bg-card", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export { Modal }
