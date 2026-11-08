import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form controls. Borders use border-border-strong (3.1:1 against the page, the WCAG
 * non-text minimum). Errors are announced (role="alert"), linked with aria-describedby,
 * and shown in words, never by colour alone.
 */
const control =
  "w-full bg-surface text-text placeholder:text-text-muted rounded-control border border-border-strong px-3.5 " +
  "transition-colors duration-(--duration-fast) hover:border-text focus-visible:border-text " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:border-2 " +
  "disabled:bg-disabled disabled:text-disabled-text disabled:cursor-not-allowed";

export function Field({
  id: idProp,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  /** optional stable id for the control (defaults to a generated one); the label is always bound to it */
  id?: string;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** render-prop receives the ids/aria props to spread on the control */
  children: (a: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean }) => ReactNode;
}) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-semibold">
        {label}
        {required && <span aria-hidden="true" className="text-text-muted"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {hint && !error && (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(control, "h-11", className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={cn(control, "h-11 pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(control, "min-h-28 py-2.5", className)} />;
}
