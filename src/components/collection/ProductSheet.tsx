"use client";
import { useEffect, useId, useRef } from "react";
import { Icon } from "../ui/Icon";
import styles from "./ProductSheet.module.css";

/**
 * Accessible bottom sheet: scrim, slide-up panel, drag-handle visual, close button,
 * Esc to close, focus moved in on open and restored on close, max 85 % height,
 * scrollable body with safe-area padding. Renders nothing when closed.
 */
export function ProductSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog, e.g. the product name. */
  label: string;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.head}>
          <span className={styles.handle} aria-hidden="true" />
          <span id={titleId} className="sr-only">
            {label}
          </span>
          <button ref={closeRef} type="button" className={`icon-btn ${styles.close}`} onClick={onClose} aria-label="Zapri">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
