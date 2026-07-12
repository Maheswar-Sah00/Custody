"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* -------------------------------------------------------------------------- */
/*  Shared field shell                                                        */
/* -------------------------------------------------------------------------- */

interface FieldShellProps {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  /** Error message; when set the control shows a red ring and this text below. */
  error?: React.ReactNode
  /** Muted helper text shown below the control (hidden when `error` is set). */
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/** Label + control + error/hint layout shared by every field wrapper. */
function FieldShell({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} className="text-foreground">
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Red-ring classes applied to a control when it has an error. */
const errorRing =
  "border-destructive focus-visible:ring-destructive focus:ring-destructive"

/* -------------------------------------------------------------------------- */
/*  InputField                                                                */
/* -------------------------------------------------------------------------- */

export interface InputFieldProps
  extends React.ComponentProps<typeof Input> {
  label?: React.ReactNode
  error?: React.ReactNode
  hint?: React.ReactNode
  /** Classes for the outer field wrapper (not the input itself). */
  wrapperClassName?: string
}

/** Labeled text input with error/hint support. */
const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  (
    { id, label, error, hint, required, className, wrapperClassName, ...props },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    return (
      <FieldShell
        label={label}
        htmlFor={inputId}
        required={required}
        error={error}
        hint={hint}
        className={wrapperClassName}
      >
        <Input
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={!!error}
          className={cn(error && errorRing, className)}
          {...props}
        />
      </FieldShell>
    )
  }
)
InputField.displayName = "InputField"

/* -------------------------------------------------------------------------- */
/*  TextareaField                                                             */
/* -------------------------------------------------------------------------- */

export interface TextareaFieldProps
  extends React.ComponentProps<typeof Textarea> {
  label?: React.ReactNode
  error?: React.ReactNode
  hint?: React.ReactNode
  wrapperClassName?: string
}

/** Labeled textarea with error/hint support. */
const TextareaField = React.forwardRef<
  HTMLTextAreaElement,
  TextareaFieldProps
>(
  (
    { id, label, error, hint, required, className, wrapperClassName, ...props },
    ref
  ) => {
    const generatedId = React.useId()
    const textareaId = id ?? generatedId
    return (
      <FieldShell
        label={label}
        htmlFor={textareaId}
        required={required}
        error={error}
        hint={hint}
        className={wrapperClassName}
      >
        <Textarea
          id={textareaId}
          ref={ref}
          required={required}
          aria-invalid={!!error}
          className={cn(error && errorRing, className)}
          {...props}
        />
      </FieldShell>
    )
  }
)
TextareaField.displayName = "TextareaField"

/* -------------------------------------------------------------------------- */
/*  SelectField                                                               */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  label: React.ReactNode
  value: string
  disabled?: boolean
}

export interface SelectFieldProps {
  label?: React.ReactNode
  error?: React.ReactNode
  hint?: React.ReactNode
  required?: boolean
  /** Options to render — easy to feed live data (departments, categories, …). */
  options: SelectOption[]
  /** Controlled value. */
  value?: string
  /** Uncontrolled initial value. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  name?: string
  id?: string
  /** Classes for the trigger. */
  className?: string
  /** Classes for the outer field wrapper. */
  wrapperClassName?: string
}

/**
 * Labeled dropdown built on the shared Select. Feed it `options` loaded from
 * the DB (e.g. departments/categories):
 *
 * ```tsx
 * <SelectField
 *   label="Department"
 *   placeholder="Select a department"
 *   options={departments.map((d) => ({ label: d.name, value: String(d.id) }))}
 *   value={value}
 *   onValueChange={setValue}
 * />
 * ```
 */
function SelectField({
  label,
  error,
  hint,
  required,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  disabled,
  name,
  id,
  className,
  wrapperClassName,
}: SelectFieldProps) {
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  return (
    <FieldShell
      label={label}
      htmlFor={selectId}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <Select
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={!!error}
          className={cn(error && errorRing, className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  DatePickerField                                                           */
/* -------------------------------------------------------------------------- */

export interface DatePickerFieldProps
  extends Omit<React.ComponentProps<typeof Input>, "type"> {
  label?: React.ReactNode
  error?: React.ReactNode
  hint?: React.ReactNode
  wrapperClassName?: string
}

/**
 * Labeled date input. Uses the native date control so values are ISO
 * `YYYY-MM-DD` strings — a direct match for Drizzle `date` columns — with no
 * extra dependency. Swappable for a calendar popover later without changing
 * the call sites.
 */
const DatePickerField = React.forwardRef<
  HTMLInputElement,
  DatePickerFieldProps
>(
  (
    { id, label, error, hint, required, className, wrapperClassName, ...props },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    return (
      <FieldShell
        label={label}
        htmlFor={inputId}
        required={required}
        error={error}
        hint={hint}
        className={wrapperClassName}
      >
        <Input
          id={inputId}
          ref={ref}
          type="date"
          required={required}
          aria-invalid={!!error}
          className={cn("[color-scheme:dark]", error && errorRing, className)}
          {...props}
        />
      </FieldShell>
    )
  }
)
DatePickerField.displayName = "DatePickerField"

export { InputField, TextareaField, SelectField, DatePickerField, FieldShell }
