"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Confirmation for destructive or hard-to-reverse actions. Built on the native <dialog>
 * (focus trap, Escape to cancel, focus returns to the opener). Focus starts on "Cancel",
 * so pressing Enter by accident never confirms.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-control border border-border-strong bg-surface p-6 text-text backdrop:bg-black/50"
    >
      <h2 id="confirm-title" className="font-display text-h3">
        {title}
      </h2>
      <div className="mt-3 text-text-secondary">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm} loading={busy} className={danger ? "bg-danger hover:bg-danger" : undefined}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
